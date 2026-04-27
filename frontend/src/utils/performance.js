// Performance optimization utilities

// Lazy load components
export const lazyLoadComponent = (importFunc) => {
  return React.lazy(importFunc);
};

// Image optimization
export const optimizeImage = (src, width, height) => {
  // Add image optimization parameters
  const params = new URLSearchParams({
    w: width,
    h: height,
    q: 80, // quality
    fm: 'webp' // format
  });
  
  return `${src}?${params.toString()}`;
};

// Debounce function for search and scroll events
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Throttle function for performance-critical events
export const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Intersection Observer for lazy loading
export const createIntersectionObserver = (callback, options = {}) => {
  return new IntersectionObserver(callback, {
    root: null,
    rootMargin: '50px',
    threshold: 0.1,
    ...options
  });
};

// Performance monitoring
export const measurePerformance = (name, fn) => {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`${name} took ${end - start} milliseconds`);
  return result;
};

// Preload critical resources
export const preloadResource = (url, as = 'script') => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = url;
  link.as = as;
  document.head.appendChild(link);
};

// Service Worker registration
export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
};

// Cache management
export const cacheData = async (cacheName, url, data) => {
  if ('caches' in window) {
    const cache = await caches.open(cacheName);
    const response = new Response(JSON.stringify(data));
    await cache.put(url, response);
  }
};

export const getCachedData = async (cacheName, url) => {
  if ('caches' in window) {
    const cache = await caches.open(cacheName);
    const response = await cache.match(url);
    return response ? await response.json() : null;
  }
  return null;
};

// Virtual scrolling helper for large lists
export const createVirtualScroll = (container, itemHeight, renderItem) => {
  let scrollTop = 0;
  let containerHeight = 0;
  let totalItems = 0;
  
  const updateVisibleItems = () => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      totalItems
    );
    
    const visibleItems = [];
    for (let i = startIndex; i < endIndex; i++) {
      visibleItems.push({
        index: i,
        top: i * itemHeight,
        element: renderItem(i)
      });
    }
    
    return visibleItems;
  };
  
  return {
    setScrollTop: (value) => { scrollTop = value; },
    setContainerHeight: (value) => { containerHeight = value; },
    setTotalItems: (value) => { totalItems = value; },
    getVisibleItems: updateVisibleItems
  };
};

// Bundle size monitoring
export const logBundleSize = () => {
  if (process.env.NODE_ENV === 'development') {
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
      console.log(`Bundle: ${script.src} - Size: ${script.getAttribute('data-size') || 'Unknown'}`);
    });
  }
};

// Memory leak detection
export const detectMemoryLeaks = () => {
  if (performance.memory) {
    const memory = performance.memory;
    console.log('Memory Usage:', {
      used: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
      total: `${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`,
      limit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`
    });
  }
};
