// Matrix Digital Rain Effect for Swagger UI
document.addEventListener('DOMContentLoaded', function() {
  // Create canvas element
  const canvas = document.createElement('canvas');
  canvas.id = 'matrix-rain';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '-1';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Add canvas as first element in body
  document.body.insertBefore(canvas, document.body.firstChild);
  
  // Update header styling
  const header = document.querySelector('.swagger-ui .topbar');
  if (header) {
    header.style.background = 'rgba(0, 0, 0, 0.8)';
    header.style.borderBottom = '1px solid #0f0';
  }
  
  // Update overall styling
  document.body.style.backgroundColor = '#000';
  const swaggerUI = document.querySelector('.swagger-ui');
  if (swaggerUI) {
    swaggerUI.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    swaggerUI.style.color = '#0f0';
  }
  
  // Matrix digital rain animation
  const ctx = canvas.getContext('2d');
  const matrixChars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const characters = matrixChars.split('');
  const fontSize = 14;
  const columns = canvas.width / fontSize;
  const drops = [];
  
  // Initialize drops
  for (let i = 0; i < columns; i++) {
    drops[i] = Math.random() * -100;
  }
  
  // Animation function
  function draw() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#0f0';
    ctx.font = fontSize + 'px monospace';
    
    for (let i = 0; i < drops.length; i++) {
      const text = characters[Math.floor(Math.random() * characters.length)];
      const opacity = Math.random() * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(0, 255, 0, ' + opacity + ')';
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      
      drops[i]++;
      
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
    }
  }
  
  // Handle window resize
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const newColumns = canvas.width / fontSize;
    if (newColumns > drops.length) {
      for (let i = drops.length; i < newColumns; i++) {
        drops[i] = Math.random() * -100;
      }
    }
  });
  
  // Start animation
  setInterval(draw, 33);
  
  // Add Matrix-themed navigation if we're on the API docs page
  if (window.location.pathname.includes('/api-docs')) {
    // Create subtle hover area
    const hoverArea = document.createElement('div');
    hoverArea.className = 'top-left-hover-area';
    document.body.appendChild(hoverArea);
    
    // Create Matrix escape text
    const escapeElement = document.createElement('div');
    escapeElement.className = 'matrix-escape';
    escapeElement.textContent = '$ exit';
    escapeElement.setAttribute('role', 'button');
    escapeElement.setAttribute('aria-label', 'Return to home page');
    escapeElement.setAttribute('tabindex', '0');
    document.body.appendChild(escapeElement);
    
    // Create Matrix characters bar
    const matrixCharsElement = document.createElement('div');
    matrixCharsElement.className = 'matrix-characters';
    document.body.appendChild(matrixCharsElement);
    
    // Animate Matrix characters in the top bar
    function animateMatrixChars() {
      let content = '';
      const phrases = [
        'Follow the white rabbit...',
        'Wake up, Neo...',
        'The Matrix has you...',
        'Knock, knock...'
      ];
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      
      // Add some random Matrix characters
      for (let i = 0; i < 15; i++) {
        content += characters[Math.floor(Math.random() * characters.length)];
      }
      
      // Add a phrase
      content += ' ' + phrase + ' ';
      
      // Add more random characters
      for (let i = 0; i < 10; i++) {
        content += characters[Math.floor(Math.random() * characters.length)];
      }
      
      matrixCharsElement.textContent = content;
    }
    
    // Initialize and periodically update Matrix characters
    animateMatrixChars();
    setInterval(animateMatrixChars, 3000);
    
    // Add click event to the escape element
    escapeElement.addEventListener('click', () => {
      // Create glitch effect
      document.body.style.overflow = 'hidden';
      
      // Create a full-screen overlay for the transition effect
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'black';
      overlay.style.zIndex = '10000';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.color = '#0f0';
      overlay.style.fontFamily = 'monospace';
      overlay.style.fontSize = '20px';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.5s ease';
      document.body.appendChild(overlay);
      
      // Add terminal-like text
      const terminalText = document.createElement('div');
      terminalText.style.maxWidth = '80%';
      terminalText.style.textAlign = 'left';
      overlay.appendChild(terminalText);
      
      // Animate typewriter effect
      let text = '> Exiting Matrix system...';
      let charIndex = 0;
      
      // Fade in the overlay
      setTimeout(() => {
        overlay.style.opacity = '1';
        
        // Type out the text
        const typeInterval = setInterval(() => {
          if (charIndex < text.length) {
            terminalText.textContent = text.substring(0, charIndex + 1) + '█';
            charIndex++;
          } else {
            clearInterval(typeInterval);
            terminalText.textContent = text;
            
            // Add a slight delay, then redirect
            setTimeout(() => {
              window.location.href = '/';
            }, 800);
          }
        }, 50);
      }, 100);
    });
    
    // Make it keyboard accessible
    escapeElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        escapeElement.click();
      }
    });
  }
  
  // Add Matrix styling to elements
  // Style headings
  const headings = document.querySelectorAll('.swagger-ui h1, .swagger-ui h2, .swagger-ui h3, .swagger-ui h4, .swagger-ui h5');
  headings.forEach(heading => {
    heading.style.color = '#0f0';
    heading.style.textShadow = '0 0 5px #0f0';
  });
  
  // Style buttons
  const buttons = document.querySelectorAll('.swagger-ui button');
  buttons.forEach(button => {
    button.style.backgroundColor = '#0f0';
    button.style.color = '#000';
    button.style.border = 'none';
  });
  
  // Style links
  const links = document.querySelectorAll('.swagger-ui a');
  links.forEach(link => {
    link.style.color = '#0f0';
  });
  
  // Style tables
  const tables = document.querySelectorAll('.swagger-ui table');
  tables.forEach(table => {
    table.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    table.style.color = '#0f0';
  });
  
  // Fix dropdown arrows visibility
  function enhanceDropdownArrows() {
    // Style all SVG elements (including arrows)
    const svgElements = document.querySelectorAll('.swagger-ui svg');
    svgElements.forEach(svg => {
      svg.style.fill = '#0f0';
    });
    
    // Style the operation dropdown toggles
    const dropdownToggles = document.querySelectorAll('.swagger-ui .opblock-summary-control');
    dropdownToggles.forEach(toggle => {
      // Add a more visible arrow
      const arrow = document.createElement('span');
      arrow.className = 'custom-dropdown-arrow';
      arrow.style.marginLeft = '5px';
      arrow.style.display = 'inline-block';
      arrow.style.width = '0';
      arrow.style.height = '0';
      arrow.style.borderLeft = '5px solid transparent';
      arrow.style.borderRight = '5px solid transparent';
      arrow.style.borderTop = '8px solid #0f0';
      arrow.style.position = 'relative';
      arrow.style.top = '2px';
      
      // Check if this toggle already has our custom arrow
      const existingArrow = toggle.querySelector('.custom-dropdown-arrow');
      if (!existingArrow) {
        toggle.appendChild(arrow);
      }
      
      // Add click listener to update arrow direction
      toggle.addEventListener('click', function() {
        setTimeout(() => {
          const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
          const customArrow = toggle.querySelector('.custom-dropdown-arrow');
          if (customArrow) {
            if (isExpanded) {
              customArrow.style.borderTop = 'none';
              customArrow.style.borderBottom = '8px solid #0f0';
              customArrow.style.top = '-2px';
            } else {
              customArrow.style.borderBottom = 'none';
              customArrow.style.borderTop = '8px solid #0f0';
              customArrow.style.top = '2px';
            }
          }
        }, 10);
      });
    });
  }
  
  // Run the arrow enhancement initially
  enhanceDropdownArrows();
  
  // Run it again after a delay to catch elements added after initial DOM load
  setTimeout(enhanceDropdownArrows, 1000);
  
  // And again after user interactions that might load new content
  document.addEventListener('click', function() {
    setTimeout(enhanceDropdownArrows, 500);
  });
}); 