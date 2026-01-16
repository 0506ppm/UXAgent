(() => {
  // ========== Layer 1: Prevent new tabs - Enhanced ==========

  console.log("🚀 開始初始化新分頁攔截機制...");

  // 1. 攔截 window.open()
  const originalWindowOpen = window.open;
  window.open = function (url, target, features) {
    console.log(`🔒 攔截 window.open(): url=${url}, target=${target}`);

    // 強制在當前視窗打開
    if (url) {
      window.location.href = url;
      return window;
    }

    // 如果沒有 URL，呼叫原始函數但強制 target='_self'
    return originalWindowOpen.call(window, url, "_self", features);
  };

  // 2. 攔截 Element.setAttribute 來防止動態設置 target="_blank"
  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === "target" && value === "_blank") {
      console.log(
        `🔒 攔截動態設置 target="_blank": ${this.tagName} ${
          this.href || this.textContent
        }`
      );
      // 改為 _self
      return originalSetAttribute.call(this, name, "_self");
    }
    return originalSetAttribute.call(this, name, value);
  };

  // 3. 移除所有現有的 target="_blank"
  function removeTargetBlank() {
    const links = document.querySelectorAll('a[target="_blank"]');
    links.forEach((link) => {
      console.log(`移除 target='_blank': ${link.href || link.textContent}`);
      link.setAttribute("target", "_self");
    });
  }

  // 立即執行
  removeTargetBlank();

  // 4. 監聽點擊事件來攔截可能的 window.open 呼叫
  document.addEventListener(
    "click",
    function (e) {
      let target = e.target;

      // 向上尋找 <a> 標籤
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }

      if (target && target.tagName === "A") {
        const href = target.getAttribute("href");
        const targetAttr = target.getAttribute("target");

        if (targetAttr === "_blank") {
          console.log(`🔒 點擊時發現 target="_blank"，強制改為 _self: ${href}`);
          target.setAttribute("target", "_self");
        }

        // 檢查 onclick 屬性是否包含 window.open
        const onclick = target.getAttribute("onclick");
        if (onclick && onclick.includes("window.open")) {
          console.log(`🔒 攔截 onclick 中的 window.open: ${onclick}`);
          e.preventDefault();
          e.stopPropagation();

          // 直接導航
          if (href && href !== "#" && href !== "javascript:void(0)") {
            window.location.href = href;
          }
        }
      }
    },
    true
  ); // 使用 capture phase

  // 5. 監聽動態新增的連結
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Element node
          // 檢查節點本身
          if (
            node.tagName === "A" &&
            node.getAttribute("target") === "_blank"
          ) {
            console.log(
              `移除動態添加的 target='_blank': ${node.href || node.textContent}`
            );
            node.setAttribute("target", "_self");
          }

          // 檢查子節點
          const nestedLinks = node.querySelectorAll('a[target="_blank"]');
          nestedLinks.forEach((link) => {
            console.log(
              `移除嵌套的 target='_blank': ${link.href || link.textContent}`
            );
            link.setAttribute("target", "_self");
          });
        }
      });
    });
  });

  // 開始監聽
  observer.observe(document, {
    childList: true,
    subtree: true,
  });

  console.log('✅ target="_blank" 和 window.open() 攔截器已初始化');

  // ========== Hover event tracking (original code) ==========

  const ORIG = EventTarget.prototype.addEventListener;
  const HOVER = new Set(["mouseenter", "mouseover", "pointerenter"]);
  EventTarget.prototype.addEventListener = function (type, listener, opts) {
    if (HOVER.has(type)) {
      try {
        console.log("hover event", type);
        // only real elements (skip window / document)
        if (this && this.setAttribute) {
          console.log("setting attribute", this);
          this.setAttribute("data-maybe-hoverable", "true");
        }
      } catch (_) {
        /* ignore edge‑cases */
      }
    }
    return ORIG.call(this, type, listener, opts);
  };

  // Network activity tracking for custom idle detection
  window.__networkActivity = {
    activeRequests: 0,
    lastActivity: Date.now(),
    eventTarget: new EventTarget(),

    // Emit network activity events
    _emitEvent: function (type, data = {}) {
      this.eventTarget.dispatchEvent(new CustomEvent(type, { detail: data }));
    },

    // Track XHR requests
    trackXHR: function () {
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function () {
        const xhr = new originalXHR();

        const originalOpen = xhr.open;
        xhr.open = function () {
          window.__networkActivity.activeRequests++;
          window.__networkActivity.lastActivity = Date.now();
          window.__networkActivity._emitEvent("request-start", {
            type: "xhr",
            active: window.__networkActivity.activeRequests,
          });
          console.log(
            "XHR started, active:",
            window.__networkActivity.activeRequests
          );
          return originalOpen.apply(this, arguments);
        };

        const originalSend = xhr.send;
        xhr.send = function () {
          const onComplete = () => {
            window.__networkActivity.activeRequests--;
            window.__networkActivity.lastActivity = Date.now();
            window.__networkActivity._emitEvent("request-complete", {
              type: "xhr",
              active: window.__networkActivity.activeRequests,
            });
            console.log(
              "XHR completed, active:",
              window.__networkActivity.activeRequests
            );
          };

          xhr.addEventListener("load", onComplete);
          xhr.addEventListener("error", onComplete);
          xhr.addEventListener("abort", onComplete);

          return originalSend.apply(this, arguments);
        };

        return xhr;
      };
    },

    // Track fetch requests
    trackFetch: function () {
      const originalFetch = window.fetch;
      window.fetch = function () {
        window.__networkActivity.activeRequests++;
        window.__networkActivity.lastActivity = Date.now();
        window.__networkActivity._emitEvent("request-start", {
          type: "fetch",
          active: window.__networkActivity.activeRequests,
        });
        console.log(
          "Fetch started, active:",
          window.__networkActivity.activeRequests
        );

        return originalFetch.apply(this, arguments).finally(() => {
          window.__networkActivity.activeRequests--;
          window.__networkActivity.lastActivity = Date.now();
          window.__networkActivity._emitEvent("request-complete", {
            type: "fetch",
            active: window.__networkActivity.activeRequests,
          });
          console.log(
            "Fetch completed, active:",
            window.__networkActivity.activeRequests
          );
        });
      };
    },

    // Check if network is idle (synchronous version)
    isIdle: function (idleTimeMs = 500) {
      const now = Date.now();
      return this.activeRequests === 0 && now - this.lastActivity >= idleTimeMs;
    },

    // Wait for network idle (simplified without AbortController)
    waitForIdle: function (idleTimeMs = 500, timeoutMs = 10000) {
      console.log(
        `waitForIdle called: idleTime=${idleTimeMs}ms, timeout=${timeoutMs}ms`
      );
      console.log(
        `Current state: activeRequests=${this.activeRequests}, lastActivity=${
          Date.now() - this.lastActivity
        }ms ago`
      );

      return new Promise((resolve) => {
        let idleTimeoutId = null;
        let timeoutId = null;
        let resolved = false;

        // Cleanup function
        const cleanup = () => {
          if (resolved) return;
          resolved = true;

          if (timeoutId) clearTimeout(timeoutId);
          if (idleTimeoutId) clearTimeout(idleTimeoutId);
          this.eventTarget.removeEventListener("request-start", onRequestStart);
          this.eventTarget.removeEventListener(
            "request-complete",
            onRequestComplete
          );
          console.log("Cleanup completed");
        };

        // Safe resolve function
        const safeResolve = (value) => {
          if (!resolved) {
            cleanup();
            resolve(value);
          }
        };

        // Check if idle and start waiting
        const checkIdle = () => {
          if (resolved) return;

          const now = Date.now();
          const timeSinceLastActivity = now - this.lastActivity;
          const hasActiveRequests = this.activeRequests > 0;

          console.log(
            `checkIdle: activeRequests=${this.activeRequests}, timeSinceLastActivity=${timeSinceLastActivity}ms, needIdle=${idleTimeMs}ms`
          );

          if (hasActiveRequests) {
            // Clear any pending idle timeout - we have active requests
            if (idleTimeoutId) {
              console.log("Clearing idle timeout due to active requests");
              clearTimeout(idleTimeoutId);
              idleTimeoutId = null;
            }
            console.log("Has active requests, waiting for completion");
            return;
          }

          // No active requests, check if we've been idle long enough
          if (timeSinceLastActivity >= idleTimeMs) {
            console.log(
              "Already idle for required time, resolving immediately"
            );
            safeResolve(true);
            return;
          }

          // Need to wait more time. Calculate remaining time needed.
          const remainingTime = idleTimeMs - timeSinceLastActivity;
          console.log(
            `Need to wait ${remainingTime}ms more for idle (${timeSinceLastActivity}ms elapsed of ${idleTimeMs}ms needed)`
          );

          // Clear any existing timeout
          if (idleTimeoutId) {
            clearTimeout(idleTimeoutId);
          }

          // Set timeout for remaining time
          idleTimeoutId = setTimeout(() => {
            if (!resolved) {
              console.log(
                `Timeout fired after ${remainingTime}ms, double-checking idle state`
              );
              // Double-check that we're still idle
              const finalTimeSinceLastActivity = Date.now() - this.lastActivity;
              if (
                this.activeRequests === 0 &&
                finalTimeSinceLastActivity >= idleTimeMs
              ) {
                console.log(
                  `Network idle confirmed: ${finalTimeSinceLastActivity}ms >= ${idleTimeMs}ms, resolving true`
                );
                safeResolve(true);
              } else {
                console.log(
                  `Idle check failed: activeRequests=${this.activeRequests}, timeSinceLastActivity=${finalTimeSinceLastActivity}ms`
                );
                // Restart the check
                checkIdle();
              }
            }
          }, remainingTime);
        };

        // Listen for network activity
        const onRequestStart = () => {
          if (resolved) return;
          console.log("Request started, clearing idle timeout");
          if (idleTimeoutId) {
            clearTimeout(idleTimeoutId);
            idleTimeoutId = null;
          }
        };

        const onRequestComplete = () => {
          if (resolved) return;
          console.log("Request completed, checking idle in 50ms");
          // Small delay to let any follow-up requests start
          setTimeout(checkIdle, 50);
        };

        this.eventTarget.addEventListener("request-start", onRequestStart);
        this.eventTarget.addEventListener(
          "request-complete",
          onRequestComplete
        );

        // Overall timeout
        timeoutId = setTimeout(() => {
          console.log("Overall timeout reached, resolving false");
          safeResolve(false); // Timeout, not idle
        }, timeoutMs);

        // Initial check
        console.log("Performing initial idle check");
        checkIdle();
      });
    },

    // Simple status check
    getStatus: function () {
      return {
        activeRequests: this.activeRequests,
        lastActivity: this.lastActivity,
        timeSinceLastActivity: Date.now() - this.lastActivity,
      };
    },
  };

  // Initialize tracking
  window.__networkActivity.trackXHR();
  window.__networkActivity.trackFetch();

  // ========== Toast message listener ==========

  // 儲存捕捉到的 toast 訊息
  window.__toastMessages = [];
  window.__cartCountChanges = [];

  // 記錄初始購物車數量
  let initialCartCount = null;

  // 監聽購物車數量變化
  function trackCartCount() {
    const cartBadge = document.querySelector(
      '.round-badge.cms-badge, [data-ng-bind*="CartCount"], .cart-count, .shopping-cart-count'
    );

    if (cartBadge) {
      const currentCount = parseInt(cartBadge.textContent) || 0;

      if (initialCartCount === null) {
        initialCartCount = currentCount;
        console.log(`📊 初始購物車數量: ${initialCartCount}`);
      } else if (currentCount !== initialCartCount) {
        const change = {
          from: initialCartCount,
          to: currentCount,
          timestamp: new Date().toISOString(),
          element: cartBadge.outerHTML,
        };
        window.__cartCountChanges.push(change);
        console.log(`🛒 購物車數量變化: ${initialCartCount} → ${currentCount}`);
        initialCartCount = currentCount;
      }
    }
  }

  // 定期檢查購物車數量（每 100ms）
  setInterval(trackCartCount, 100);

  // 監聽 DOM 變化來捕捉 toast 訊息
  const toastObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Element node
          // 檢查是否為 toast/alert/notification 容器
          const isToast =
            node.classList?.contains("toast") ||
            node.classList?.contains("alert") ||
            node.classList?.contains("notification") ||
            node.classList?.contains("snackbar") ||
            node.classList?.contains("message") ||
            node.classList?.contains("success-message") ||
            node.getAttribute("role") === "alert" ||
            node.querySelector(".toast, .alert, .notification, .snackbar");

          if (isToast) {
            const message = {
              text: node.textContent.trim(),
              html: node.outerHTML,
              className: node.className,
              timestamp: new Date().toISOString(),
              visible: true,
            };

            window.__toastMessages.push(message);
            console.log("🔔 捕捉到 Toast 訊息:", message.text);

            // 標記這個 toast 以便後續檢索
            node.setAttribute("data-toast-captured", "true");

            // 監聽這個 toast 的移除
            const removeObserver = new MutationObserver((removeMutations) => {
              removeMutations.forEach((removeMutation) => {
                removeMutation.removedNodes.forEach((removedNode) => {
                  if (removedNode === node) {
                    console.log("🔔 Toast 訊息已消失:", message.text);
                    message.visible = false;
                    removeObserver.disconnect();
                  }
                });
              });
            });

            if (node.parentNode) {
              removeObserver.observe(node.parentNode, { childList: true });
            }
          }
        }
      });
    });
  });

  // 延遲啟動 toast observer（等 DOM 準備好）
  if (document.body) {
    toastObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    console.log("✅ Toast 監聽器已初始化");
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      toastObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      console.log("✅ Toast 監聽器已初始化（DOMContentLoaded）");
    });
  }

  // 提供檢索函數
  window.__getToastMessages = function () {
    return {
      messages: window.__toastMessages,
      cartChanges: window.__cartCountChanges,
      hasNewMessages: window.__toastMessages.some((m) => m.visible),
      summary: {
        totalToasts: window.__toastMessages.length,
        visibleToasts: window.__toastMessages.filter((m) => m.visible).length,
        cartChanged: window.__cartCountChanges.length > 0,
        latestCartCount: initialCartCount,
      },
    };
  };

  // 清除函數
  window.__clearToastMessages = function () {
    window.__toastMessages = [];
    window.__cartCountChanges = [];
  };

  // ========== 🆕 Anchor Link and Viewport Tracking ==========

  // 初始化滾動追蹤
  window.__scrollTracking = {
    lastScrollY: window.scrollY,
    scrollChanged: false,
    scrollHistory: [],
    anchorClicks: [],
  };

  // 監聽錨點連結的點擊（針對 data-du-smooth-scroll）
  document.addEventListener(
    "click",
    function (e) {
      let target = e.target;

      // 向上尋找 <a> 標籤
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }

      if (target && target.tagName === "A") {
        const href = target.getAttribute("href");

        // 檢查是否為錨點連結（以 # 開頭）
        if (href && href.startsWith("#")) {
          const anchorId = href.substring(1);
          const targetElement = document.getElementById(anchorId);
          const linkText = target.textContent.trim();

          console.log(`🔗 點擊錨點連結: ${href} (${linkText})`);

          // 記錄錨點點擊
          const clickRecord = {
            href: href,
            anchorId: anchorId,
            targetExists: !!targetElement,
            scrollBefore: window.scrollY,
            timestamp: new Date().toISOString(),
            linkText: linkText,
            // 記錄娘家網站特有的屬性
            hasSmoothScroll:
              target.hasAttribute("data-du-smooth-scroll") ||
              target.hasAttribute("data-smooth-scroll"),
            hasScrollspy: target.hasAttribute("data-du-scrollspy"),
            offset: target.getAttribute("data-offset"),
            // 記錄是否為導航標籤
            isNavTab: target.classList.contains("nav-tab-link"),
          };

          window.__scrollTracking.anchorClicks.push(clickRecord);

          // 延遲檢查滾動結果（等待平滑滾動完成）
          setTimeout(() => {
            const lastClick =
              window.__scrollTracking.anchorClicks[
                window.__scrollTracking.anchorClicks.length - 1
              ];
            if (lastClick === clickRecord) {
              lastClick.scrollAfter = window.scrollY;
              lastClick.scrollDelta = window.scrollY - lastClick.scrollBefore;

              console.log(
                `📜 錨點跳轉完成: ${lastClick.linkText} (滾動 ${lastClick.scrollDelta}px)`
              );

              // 如果有明顯滾動，標記為已改變
              if (Math.abs(lastClick.scrollDelta) > 50) {
                window.__scrollTracking.scrollChanged = true;
              }
            }
          }, 1000); // 等待 1 秒讓平滑滾動完成
        }
      }
    },
    true
  ); // 使用 capture phase

  // 監聽滾動事件
  let scrollTimeout;
  window.addEventListener("scroll", () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - window.__scrollTracking.lastScrollY;

      if (Math.abs(scrollDelta) > 100) {
        window.__scrollTracking.scrollChanged = true;
        window.__scrollTracking.scrollHistory.push({
          from: window.__scrollTracking.lastScrollY,
          to: currentScrollY,
          delta: scrollDelta,
          timestamp: new Date().toISOString(),
        });

        console.log(
          `📜 頁面滾動: ${
            window.__scrollTracking.lastScrollY
          } → ${currentScrollY} (${
            scrollDelta > 0 ? "向下" : "向上"
          } ${Math.abs(scrollDelta)}px)`
        );

        window.__scrollTracking.lastScrollY = currentScrollY;
      }
    }, 200);
  });

  // 監聽 hash 變化（備用）
  window.__hashChangeHistory = [];
  window.addEventListener("hashchange", (event) => {
    console.log(`🔗 Hash 變化: ${event.oldURL} → ${event.newURL}`);

    window.__hashChangeHistory.push({
      oldURL: event.oldURL,
      newURL: event.newURL,
      oldHash: new URL(event.oldURL).hash,
      newHash: new URL(event.newURL).hash,
      timestamp: new Date().toISOString(),
    });
  });

  // 提供視口資訊檢索函數
  window.__getViewportInfo = function () {
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;

    // 找出視口中可見的重要元素
    const allElements = document.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, section[id], div[id], p"
    );
    const visibleElements = [];

    allElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const visibleRatio = Math.max(
        0,
        Math.min(
          1,
          (Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)) /
            rect.height
        )
      );

      // 至少 30% 可見
      if (visibleRatio > 0.3) {
        const text = el.textContent.trim();
        if (text.length > 0) {
          // 過濾空元素
          visibleElements.push({
            tag: el.tagName,
            id: el.id,
            class: el.className,
            text: text.substring(0, 150), // 取前 150 字元
            visibleRatio: visibleRatio.toFixed(2),
          });
        }
      }
    });

    // 找出最近點擊的錨點連結
    const recentAnchorClick =
      window.__scrollTracking.anchorClicks.length > 0
        ? window.__scrollTracking.anchorClicks[
            window.__scrollTracking.anchorClicks.length - 1
          ]
        : null;

    return {
      scrollY: scrollY,
      scrollChanged: window.__scrollTracking.scrollChanged,
      scrollHistory: window.__scrollTracking.scrollHistory.slice(-5), // 只保留最近 5 次
      currentHash: window.location.hash,
      hashHistory: window.__hashChangeHistory,
      anchorClicks: window.__scrollTracking.anchorClicks,
      recentAnchorClick: recentAnchorClick,
      visibleElements: visibleElements.slice(0, 15), // 只返回前 15 個
      viewportHeight: viewportHeight,
    };
  };

  // 清除滾動變化標記
  window.__clearScrollChanged = function () {
    window.__scrollTracking.scrollChanged = false;
  };

  console.log("✅ 錨點連結和視口追蹤已初始化");

  // ========== Final log ==========

  console.log(
    "✅ initscript.js 完全載入：target='_blank' 防護、Toast 監聽、網路追蹤、視口追蹤"
  );
})();
