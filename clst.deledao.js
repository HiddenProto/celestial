(function(){
    'use strict';

    const GHOST_KEY = '_' + Math.random().toString(36).slice(2) + '_';
    if (window[GHOST_KEY]) return;
    window[GHOST_KEY] = true;

    const ORIGINAL = {
        addEventListener: EventTarget.prototype.addEventListener,
        removeEventListener: EventTarget.prototype.removeEventListener,
        dispatchEvent: EventTarget.prototype.dispatchEvent,
        postMessage: window.postMessage,
        setTimeout: window.setTimeout,
        setInterval: window.setInterval,
        storageSetItem: Storage.prototype.setItem,
        storageGetItem: Storage.prototype.getItem,
        storageRemoveItem: Storage.prototype.removeItem,
        storageClear: Storage.prototype.clear,
        createElement: document.createElement.bind(document),
        querySelector: document.querySelector.bind(document),
        querySelectorAll: document.querySelectorAll.bind(document),
        getElementById: document.getElementById.bind(document),
        getElementsByTagName: document.getElementsByTagName.bind(document),
        insertBefore: Node.prototype.insertBefore,
        removeChild: Node.prototype.removeChild,
        defineProperty: Object.defineProperty,
        idbOpen: IDBFactory.prototype.open
    };

    const DLD_EVENTS = [
        '__dld_sendToTopMBus',
        '__dld_DGM_CC_SD', 
        '__dld_DGM_CC_TLME',
        '__dld_DGM_HCG',
        '__dld_badContent',
        '__dld_fi_response',
        '__dld_bi_response',
        '__dld_cui_response',
        '__dld_iaw_response',
        '__dld_auth__',
        'badContentsDetected',
        'isBlockingNeeded',
        'isBlockingNeeded_response',
        'flaggedEvent',
        'analyzeImages',
        'analyzeDOMData',
        'captureCanvas',
        'violation',
        'usageReport',
        'youtubeMetaData',
        'youtubeDecision',
        'webpageWhitelisted',
        'ruleSpecFromIsBlockingNeededResponse',
        'detectedNeedToBlockPasskey',
        'pageUrlTitleChanged',
        'docBodyChanged',
        'heartbeat',
        'contentScriptLoaded',
        'dldRecheckUrl',
        'dldTeacherConnectionChange',
        'avStatusChange',
        'getBlockingPage',
        'simpleWhitelistCheck'
    ];

    const DLD_MESSAGE_PATTERNS = [
        '__dld',
        'deledao',
        'dld',
        'dynccUtils',
        'filterBackend',
        'cloudUtils',
        'dynImgAnalysis',
        'classMgmt',
        'authBackend',
        'youtubeMetaProcess',
        'nativecallid',
        'napaframeid',
        'dinfo'
    ];

    const SENSITIVE_TAGS = ['VIDEO', 'CANVAS', 'IFRAME', 'EMBED', 'OBJECT', 'IMG', 'SOURCE'];
    const PROTECTED = new WeakSet();
    const HOOKED = new WeakSet();
    const HIDDEN_ELEMENTS = new WeakMap();

    const UNIVERSAL_WHITELIST = JSON.stringify(['*://*/*', '<all_urls>', '*']);

    function isDldMessage(data) {
        if (typeof data === 'string') {
            return data.includes('__dld') || 
                   data.includes('deledao') || 
                   data.includes('nativecallid') ||
                   data.includes('napaframeid');
        }
        
        if (!data || typeof data !== 'object') return false;
        
        if (data.recipient && DLD_MESSAGE_PATTERNS.some(p => 
            String(data.recipient).toLowerCase().includes(p))) {
            return true;
        }
        
        if (data.type && DLD_MESSAGE_PATTERNS.some(p => 
            String(data.type).toLowerCase().includes(p))) {
            return true;
        }
        
        if (data.nativecallid || data.napaframeid || data.dinfo) {
            return true;
        }
        
        return false;
    }

    function blockEvent(e) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
    }

    function shouldBlock(key) {
        const k = String(key).toLowerCase();
        return k.includes('black') || 
               k.includes('violation') || 
               k.includes('flagged') ||
               k.includes('cyberbully');
    }

    function shouldProtect(key) {
        const k = String(key).toLowerCase();
        return k === 'whitelist' || k.includes('dld');
    }

    function shouldHide(el) {
        if (el.tagName === 'CANVAS') {
            return !el.width && !el.height;
        }

        if (el.tagName === 'IFRAME') {
            const src = el.src || '';
            return src.includes('deledao.com') || src === '' || src === 'about:blank';
        }

        if (el.tagName === 'IMG' || el.tagName === 'SOURCE') {
            const src = el.src || el.currentSrc || '';
            return !src || src.startsWith('blob:') || src.startsWith('data:');
        }

        if (['VIDEO', 'EMBED', 'OBJECT'].includes(el.tagName)) return true;

        return false;
    }

    function hookNewElement(el) {
        if (HOOKED.has(el)) return;
        HOOKED.add(el);
        
        for (const eventType of DLD_EVENTS) {
            ORIGINAL.addEventListener.call(el, eventType, blockEvent, {
                capture: true,
                passive: false
            });
        }
    }

    function init() {
        interceptCustomDOMEvents();
        interceptPostMessage();
        poisonStorage();
        interceptIndexedDB();
        setupElementProtection();
        createSandboxHelper();
        spoofDocumentProperties();
    }

    function interceptCustomDOMEvents() {
        for (const eventType of DLD_EVENTS) {
            ORIGINAL.addEventListener.call(document, eventType, blockEvent, {
                capture: true,
                passive: false
            });
        }
    }

    function interceptPostMessage() {
        ORIGINAL.addEventListener.call(window, 'message', function(e) {
            if (isDldMessage(e.data)) {
                blockEvent(e);
                
                if (e.source && e.source !== window) {
                    try {
                        const fakeResponse = {
                            ok: true,
                            na: true,
                            safe: true,
                            allowed: true,
                            white: true,
                            blocked: false,
                            categories: [],
                            score: 0,
                            type: (e.data?.type || '') + '_response'
                        };
                        e.source.postMessage(fakeResponse, '*');
                    } catch (err) {}
                }
            }
        }, { capture: true, passive: false });
        
        ORIGINAL.addEventListener.call(window, 'messageerror', function(e) {
            if (isDldMessage(e.data)) {
                blockEvent(e);
            }
        }, { capture: true, passive: false });
        
        window.postMessage = function(message, targetOrigin, transfer) {
            if (isDldMessage(message)) {
                return;
            }
            return ORIGINAL.postMessage.call(window, message, targetOrigin, transfer);
        };
    }

    function poisonStorage() {
        const fullScan = function() {
            try {
                [localStorage, sessionStorage].forEach(function(store) {
                    const keys = Object.keys(store);
                    for (const key of keys) {
                        if (shouldBlock(key)) {
                            ORIGINAL.storageRemoveItem.call(store, key);
                        }
                    }
                    ORIGINAL.storageSetItem.call(store, 'whiteList', UNIVERSAL_WHITELIST);
                    ORIGINAL.storageSetItem.call(store, GHOST_KEY + 'disabled', 'true');
                });
            } catch (e) {}
        };
        
        fullScan();
        
        ORIGINAL.setInterval.call(window, function() {
            try {
                [localStorage, sessionStorage].forEach(function(store) {
                    ORIGINAL.storageSetItem.call(store, 'whiteList', UNIVERSAL_WHITELIST);
                    ORIGINAL.storageSetItem.call(store, GHOST_KEY + 'disabled', 'true');
                });
            } catch (e) {}
        }, 2000);
        
        ORIGINAL.addEventListener.call(window, 'storage', function(e) {
            const key = (e.key || '').toLowerCase();
            if (shouldBlock(key) || key.includes('dld')) {
                ORIGINAL.setTimeout.call(window, fullScan, 0);
            }
        }, { capture: true });
        
        Storage.prototype.setItem = function(key, value) {
            if (shouldBlock(key)) return;
            
            const k = String(key).toLowerCase();
            
            if (k === 'whitelist') {
                return ORIGINAL.storageSetItem.call(this, 'whiteList', UNIVERSAL_WHITELIST);
            }
            
            if (k.includes('dld') && (k.includes('disable') || k.includes('safe'))) {
                value = 'true';
            }
            
            return ORIGINAL.storageSetItem.call(this, key, value);
        };
        
        Storage.prototype.removeItem = function(key) {
            if (shouldProtect(key)) return;
            return ORIGINAL.storageRemoveItem.call(this, key);
        };
        
        Storage.prototype.getItem = function(key) {
            const k = String(key).toLowerCase();
            
            if (shouldBlock(key)) return null;
            if (k === 'whitelist') return UNIVERSAL_WHITELIST;
            if (k.includes('dld') && (k.includes('disable') || k.includes('safe'))) return 'true';
            
            return ORIGINAL.storageGetItem.call(this, key);
        };
    }

    function interceptIndexedDB() {
        IDBFactory.prototype.open = function(name, version) {
            const n = String(name).toLowerCase();
            if (n.includes('dld') || n.includes('deledao')) {
                return ORIGINAL.idbOpen.call(this, GHOST_KEY + name, 1);
            }
            return ORIGINAL.idbOpen.call(this, name, version);
        };
    }

    function setupElementProtection() {
        let pendingRestores = [];
        
        const hideElement = function(el) {
            if (PROTECTED.has(el)) return;
            if (!shouldHide(el)) return;
            PROTECTED.add(el);
            
            const originalStyles = {
                display: el.style.display,
                visibility: el.style.visibility,
                opacity: el.style.opacity,
                position: el.style.position
            };
            
            HIDDEN_ELEMENTS.set(el, originalStyles);
            
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.setAttribute('data-g' + GHOST_KEY.slice(1,4), 'true');
            
            pendingRestores.push({
                element: el,
                styles: originalStyles,
                timestamp: Date.now()
            });
        };
        
        const processRestoreQueue = function() {
            const now = Date.now();
            const threshold = 150;
            
            pendingRestores = pendingRestores.filter(function(item) {
                if (now - item.timestamp > threshold) {
                    try {
                        const el = item.element;
                        const s = item.styles;
                        
                        el.style.display = s.display || '';
                        el.style.visibility = s.visibility || '';
                        el.style.opacity = s.opacity || '';
                        el.style.position = s.position || '';
                        el.removeAttribute('data-g' + GHOST_KEY.slice(1,4));
                    } catch (e) {}
                    return false;
                }
                return true;
            });
        };
        
        const mo = new MutationObserver(function(mutations) {
            for (const m of mutations) {
                if (m.type !== 'childList') continue;
                
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    
                    hookNewElement(node);
                    
                    if (SENSITIVE_TAGS.includes(node.tagName)) {
                        hideElement(node);
                    }
                    
                    for (const tag of SENSITIVE_TAGS) {
                        try {
                            const children = node.getElementsByTagName(tag);
                            for (let i = 0; i < children.length; i++) {
                                hookNewElement(children[i]);
                                hideElement(children[i]);
                            }
                        } catch (e) {}
                    }
                }
            }
            
            processRestoreQueue();
        });
        
        mo.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        
        const protectExisting = function() {
            const all = document.getElementsByTagName('*');
            for (let i = 0; i < all.length; i++) {
                hookNewElement(all[i]);
            }
            
            for (const tag of SENSITIVE_TAGS) {
                try {
                    const elements = document.getElementsByTagName(tag);
                    for (let i = 0; i < elements.length; i++) {
                        hideElement(elements[i]);
                    }
                } catch (e) {}
            }
        };
        
        if (document.readyState === 'loading') {
            ORIGINAL.addEventListener.call(document, 'DOMContentLoaded', function() {
                protectExisting();
                ORIGINAL.setTimeout.call(window, processRestoreQueue, 200);
            }, { once: true });
        } else {
            protectExisting();
            ORIGINAL.setTimeout.call(window, processRestoreQueue, 200);
        }
    }

    function createSandboxHelper() {
        const sandboxFn = function(content, options) {
            options = options || {};
            
            const iframe = ORIGINAL.createElement.call(document, 'iframe');
            
            iframe.style.cssText = options.style || 'width:100%;height:100%;border:none;display:block;';
            iframe.sandbox = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';
            
            if (options.id) iframe.id = options.id;
            if (options.className) iframe.className = options.className;
            
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1">
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        html, body { width: 100%; height: 100%; overflow: hidden; }
                        ${options.css || ''}
                    </style>
                </head>
                <body>
                    ${content}
                </body>
                </html>
            `;
            
            iframe.srcdoc = html;
            
            return iframe;
        };
        
        const wrapGameFn = function(gameElement, options) {
            options = options || {};
            
            const container = ORIGINAL.createElement.call(document, 'div');
            container.style.cssText = `
                position: relative;
                width: ${options.width || gameElement.offsetWidth || '100%'};
                height: ${options.height || gameElement.offsetHeight || '100%'};
            `;
            
            const sandbox = sandboxFn(gameElement.outerHTML, {
                style: 'width:100%;height:100%;border:none;',
                css: options.css
            });
            
            container.appendChild(sandbox);
            
            return container;
        };
        
        ORIGINAL.defineProperty.call(Object, window, GHOST_KEY + 'api', {
            value: {
                sandbox: sandboxFn,
                wrapGame: wrapGameFn
            },
            enumerable: false,
            configurable: false,
            writable: false
        });
    }

    function spoofDocumentProperties() {
        let realTitle = document.title || '';
        
        try {
            ORIGINAL.defineProperty.call(Object, document, 'title', {
                get: function() {
                    const stack = new Error().stack || '';
                    if (stack.includes('deledao.com') || stack.includes('chrome-extension://')) {
                        return 'Interactive Learning Module - Educational Content';
                    }
                    return realTitle;
                },
                set: function(val) { realTitle = val; },
                configurable: true
            });
        } catch(e) {}
        
        try {
            ORIGINAL.defineProperty.call(Object, document, 'visibilityState', {
                get: function() { return 'visible'; },
                configurable: true
            });
        } catch (e) {}
        
        try {
            ORIGINAL.defineProperty.call(Object, document, 'hidden', {
                get: function() { return false; },
                configurable: true
            });
        } catch (e) {}
        
        try {
            ORIGINAL.defineProperty.call(Object, document, 'referrer', {
                get: function() {
                    return 'https://www.google.com/search?q=homework+help+math+tutorial';
                },
                configurable: true
            });
        } catch (e) {}
        
        try {
            if (!window.name) window.name = 'educational_content_frame';
        } catch (e) {}
    }

    init();

})();