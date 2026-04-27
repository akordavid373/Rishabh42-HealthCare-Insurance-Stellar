// Accessibility utilities and helpers

// ARIA label generators
export const generateAriaLabel = (action, object, context = '') => {
  const baseLabel = `${action} ${object}`;
  return context ? `${baseLabel}, ${context}` : baseLabel;
};

// Focus management
export const trapFocus = (element) => {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          lastFocusable.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          firstFocusable.focus();
          e.preventDefault();
        }
      }
    }
  };

  element.addEventListener('keydown', handleTabKey);
  firstFocusable.focus();

  return () => {
    element.removeEventListener('keydown', handleTabKey);
  };
};

// Screen reader announcements
export const announceToScreenReader = (message, priority = 'polite') => {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

// Keyboard navigation helpers
export const handleKeyboardNavigation = (event, callbacks) => {
  const { onEnter, onSpace, onEscape, onArrow, onTab } = callbacks;

  switch (event.key) {
    case 'Enter':
      if (onEnter) {
        event.preventDefault();
        onEnter(event);
      }
      break;
    case ' ':
    case 'Spacebar':
      if (onSpace) {
        event.preventDefault();
        onSpace(event);
      }
      break;
    case 'Escape':
      if (onEscape) {
        event.preventDefault();
        onEscape(event);
      }
      break;
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      if (onArrow) {
        event.preventDefault();
        onArrow(event);
      }
      break;
    case 'Tab':
      if (onTab) {
        onTab(event);
      }
      break;
  }
};

// Color contrast checker
export const checkColorContrast = (foreground, background) => {
  const getLuminance = (hex) => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    
    const rsRGB = r / 255;
    const gsRGB = g / 255;
    const bsRGB = b / 255;
    
    const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
    
    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return {
    ratio: contrast,
    wcagAA: contrast >= 4.5,
    wcagAAA: contrast >= 7,
    wcagAALarge: contrast >= 3
  };
};

// Touch target size validator
export const validateTouchTarget = (element, minSize = 44) => {
  const rect = element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  
  return {
    isValid: width >= minSize && height >= minSize,
    width,
    height,
    minWidth: minSize,
    minHeight: minSize
  };
};

// Skip links generator
export const createSkipLinks = () => {
  const skipLinks = [
    { href: '#main-content', text: 'Skip to main content' },
    { href: '#navigation', text: 'Skip to navigation' },
    { href: '#search', text: 'Skip to search' }
  ];

  const skipLinksContainer = document.createElement('div');
  skipLinksContainer.className = 'skip-links';
  
  skipLinks.forEach(link => {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.text;
    a.className = 'skip-link';
    skipLinksContainer.appendChild(a);
  });

  return skipLinksContainer;
};

// Heading hierarchy checker
export const checkHeadingHierarchy = (container) => {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const issues = [];
  let previousLevel = 0;

  headings.forEach((heading, index) => {
    const currentLevel = parseInt(heading.tagName.substring(1));
    
    if (index === 0 && currentLevel !== 1) {
      issues.push({
        element: heading,
        message: 'First heading should be h1'
      });
    }
    
    if (currentLevel - previousLevel > 1) {
      issues.push({
        element: heading,
        message: `Heading level skipped from h${previousLevel} to h${currentLevel}`
      });
    }
    
    previousLevel = currentLevel;
  });

  return issues;
};

// Alt text checker for images
export const checkImageAltText = (container) => {
  const images = container.querySelectorAll('img');
  const issues = [];

  images.forEach((img, index) => {
    if (!img.alt && img.alt !== '') {
      issues.push({
        element: img,
        message: 'Image missing alt text',
        index
      });
    }
  });

  return issues;
};

// Form validation accessibility
export const makeFormAccessible = (form) => {
  const inputs = form.querySelectorAll('input, select, textarea');
  
  inputs.forEach(input => {
    // Ensure each input has a label
    const label = form.querySelector(`label[for="${input.id}"]`) || 
                  input.closest('label');
    
    if (!label) {
      const newLabel = document.createElement('label');
      newLabel.textContent = input.placeholder || input.name || 'Input field';
      newLabel.setAttribute('for', input.id || `input-${Date.now()}`);
      if (!input.id) input.id = newLabel.getAttribute('for');
      input.parentNode.insertBefore(newLabel, input);
    }

    // Add aria-required for required fields
    if (input.required) {
      input.setAttribute('aria-required', 'true');
    }

    // Add aria-invalid for validation
    input.addEventListener('invalid', () => {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${input.id}-error`);
    });

    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
    });
  });
};

// Reduced motion detection
export const prefersReducedMotion = () => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// High contrast mode detection
export const prefersHighContrast = () => {
  return window.matchMedia('(prefers-contrast: high)').matches;
};

// Screen reader detection
export const isScreenReaderActive = () => {
  // Common screen reader detection methods
  return window.speechSynthesis && 
         window.speechSynthesis.getVoices().length > 0 ||
         navigator.userAgent.match(/JAWS|NVDA|VoiceOver|TalkBack/);
};

// Accessibility testing helper
export const runAccessibilityAudit = (container = document) => {
  const results = {
    headingIssues: checkHeadingHierarchy(container),
    imageIssues: checkImageAltText(container),
    touchTargetIssues: [],
    colorContrastIssues: []
  };

  // Check touch targets
  const interactiveElements = container.querySelectorAll('button, a, input, [role="button"]');
  interactiveElements.forEach(element => {
    const validation = validateTouchTarget(element);
    if (!validation.isValid) {
      results.touchTargetIssues.push({
        element,
        ...validation
      });
    }
  });

  return results;
};

// Focus visible polyfill
export const setupFocusVisible = () => {
  let hadKeyboardEvent = false;

  const handleKeyDown = (e) => {
    if (e.metaKey || e.altKey || e.ctrlKey) return;
    hadKeyboardEvent = true;
  };

  const handleMouseDown = () => {
    hadKeyboardEvent = false;
  };

  const addFocusVisibleClass = (e) => {
    if (hadKeyboardEvent) {
      e.target.classList.add('focus-visible');
    }
  };

  const removeFocusVisibleClass = (e) => {
    e.target.classList.remove('focus-visible');
  };

  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('focus', addFocusVisibleClass, true);
  document.addEventListener('blur', removeFocusVisibleClass, true);
};
