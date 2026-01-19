// State management
let selectedItem = null;
let isDragging = false;
let dragStartY = 0;
let dragStartScrollTop = 0;
let lastDragY = 0;
let lastDragTime = 0;
let velocity = 0;
let momentumAnimation = null;
let currentColumn = null;
let tooltipTimeout = null;
let scrollTimeouts = new WeakMap(); // Track scroll timeouts per column

// Constants
const SNAP_THRESHOLD = 100;
const VELOCITY_MULTIPLIER = 0.95;
const MIN_VELOCITY = 0.5;
const RUBBER_BAND_RESISTANCE = 0.3;
const TOOLTIP_DELAY = 500;
const TARGET_FPS = 60;
const FPS_NORMALIZATION = 1000 / TARGET_FPS; // Convert ms to frame time
const INITIALIZATION_DELAY = 100;
const SNAP_UPDATE_DELAY = 300;
const PULSE_DURATION = 600;
const PING_DURATION = 1000;
const SCROLL_THROTTLE_DELAY = 150;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    initializeParticles();
    initializeColumns();
    initializeConfirmButton();
    initializeTooltips();
    
    // Set middle items as initially active
    setTimeout(() => {
        document.querySelectorAll('.jewelry-column').forEach(column => {
            selectMiddleItemAsFallback(column);
        });
    }, INITIALIZATION_DELAY);
});

// Particle system for visual effects
function initializeParticles() {
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    const box = document.querySelector('.jewelry-box');
    
    canvas.width = 630;
    canvas.height = 448;
    
    const particles = [];
    const particleCount = 50;
    
    // Create particles
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            size: Math.random() * 2 + 0.5,
            opacity: Math.random() * 0.3 + 0.1
        });
    }
    
    // Animate particles
    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Wrap around edges
            if (particle.x < 0) particle.x = canvas.width;
            if (particle.x > canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = canvas.height;
            if (particle.y > canvas.height) particle.y = 0;
            
            // Draw particle
            ctx.fillStyle = `rgba(212, 175, 55, ${particle.opacity})`;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        requestAnimationFrame(animateParticles);
    }
    
    animateParticles();
}

// Initialize columns with event listeners
function initializeColumns() {
    const columns = document.querySelectorAll('.jewelry-column');
    
    columns.forEach(column => {
        const container = column.querySelector('.items-container');
        
        // Mouse events
        container.addEventListener('mousedown', handleDragStart);
        container.addEventListener('mousemove', handleDragMove);
        container.addEventListener('mouseup', handleDragEnd);
        container.addEventListener('mouseleave', handleDragEnd);
        
        // Touch events
        container.addEventListener('touchstart', handleDragStart, { passive: false });
        container.addEventListener('touchmove', handleDragMove, { passive: false });
        container.addEventListener('touchend', handleDragEnd);
        container.addEventListener('touchcancel', handleDragEnd);
        
        // Scroll event (throttled per column)
        container.addEventListener('scroll', () => {
            container.classList.add('scrolling');
            
            const existingTimeout = scrollTimeouts.get(container);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
            }
            
            const newTimeout = setTimeout(() => {
                container.classList.remove('scrolling');
                updateActiveItem(column);
            }, SCROLL_THROTTLE_DELAY);
            
            scrollTimeouts.set(container, newTimeout);
            updateActiveItem(column);
        });
        
        // Click selection on items (event delegation)
        container.addEventListener('click', (e) => {
            const item = e.target.closest('.jewelry-item');
            if (item && !isDragging) {
                selectItem(item, column);
            }
        });
    });
}

// Handle drag start
function handleDragStart(e) {
    const container = e.currentTarget;
    currentColumn = container.closest('.jewelry-column');
    
    isDragging = true;
    velocity = 0;
    
    if (momentumAnimation) {
        cancelAnimationFrame(momentumAnimation);
        momentumAnimation = null;
    }
    
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    dragStartY = clientY;
    dragStartScrollTop = container.scrollTop;
    lastDragY = clientY;
    lastDragTime = Date.now();
    
    container.style.cursor = 'grabbing';
    
    if (e.type.includes('touch')) {
        e.preventDefault();
    }
}

// Handle drag move
function handleDragMove(e) {
    if (!isDragging) return;
    
    const container = e.currentTarget;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const deltaY = dragStartY - clientY;
    const now = Date.now();
    const timeDelta = now - lastDragTime;
    
    // Calculate velocity
    if (timeDelta > 0) {
        const moveDelta = lastDragY - clientY;
        velocity = moveDelta / timeDelta * FPS_NORMALIZATION; // Normalize to 60fps
    }
    
    lastDragY = clientY;
    lastDragTime = now;
    
    // Apply scroll with rubber band at boundaries
    const newScrollTop = dragStartScrollTop + deltaY;
    const maxScroll = container.scrollHeight - container.clientHeight;
    
    if (newScrollTop < 0) {
        // Top boundary rubber band
        container.scrollTop = newScrollTop * RUBBER_BAND_RESISTANCE;
    } else if (newScrollTop > maxScroll) {
        // Bottom boundary rubber band
        const overflow = newScrollTop - maxScroll;
        container.scrollTop = maxScroll + overflow * RUBBER_BAND_RESISTANCE;
    } else {
        container.scrollTop = newScrollTop;
    }
    
    if (e.type.includes('touch')) {
        e.preventDefault();
    }
}

// Handle drag end
function handleDragEnd(e) {
    if (!isDragging) return;
    
    const container = e.currentTarget;
    isDragging = false;
    container.style.cursor = 'grab';
    
    // Apply momentum scrolling
    if (Math.abs(velocity) > MIN_VELOCITY) {
        applyMomentum(container, velocity);
    } else {
        // Snap to nearest item
        snapToItem(currentColumn);
    }
    
    currentColumn = null;
}

// Apply momentum scrolling with physics
function applyMomentum(container, initialVelocity) {
    let currentVelocity = initialVelocity;
    
    function animate() {
        if (Math.abs(currentVelocity) < MIN_VELOCITY) {
            snapToItem(container.closest('.jewelry-column'));
            return;
        }
        
        const maxScroll = container.scrollHeight - container.clientHeight;
        const newScrollTop = container.scrollTop + currentVelocity;
        
        // Apply rubber band at boundaries
        if (newScrollTop < 0) {
            container.scrollTop = 0;
            currentVelocity = 0;
            snapToItem(container.closest('.jewelry-column'));
            return;
        } else if (newScrollTop > maxScroll) {
            container.scrollTop = maxScroll;
            currentVelocity = 0;
            snapToItem(container.closest('.jewelry-column'));
            return;
        } else {
            container.scrollTop = newScrollTop;
        }
        
        // Apply friction
        currentVelocity *= VELOCITY_MULTIPLIER;
        
        momentumAnimation = requestAnimationFrame(animate);
    }
    
    momentumAnimation = requestAnimationFrame(animate);
}

// Snap to nearest item with accurate center calculation
function snapToItem(column) {
    try {
        const container = column.querySelector('.items-container');
        const items = Array.from(column.querySelectorAll('.jewelry-item'));
        
        if (items.length === 0) {
            console.error('No items found in column');
            return;
        }
        
        const containerRect = container.getBoundingClientRect();
        const centerY = containerRect.top + containerRect.height / 2;
        
        // Find closest item to center
        let closestItem = null;
        let minDistance = Infinity;
        
        items.forEach(item => {
            const itemRect = item.getBoundingClientRect();
            const itemCenterY = itemRect.top + itemRect.height / 2;
            const distance = Math.abs(itemCenterY - centerY);
            
            if (distance < minDistance) {
                minDistance = distance;
                closestItem = item;
            }
        });
        
        if (closestItem) {
            // Scroll to center the closest item
            const itemRect = closestItem.getBoundingClientRect();
            const itemCenterY = itemRect.top + itemRect.height / 2;
            const scrollAdjustment = itemCenterY - centerY;
            
            container.scrollBy({
                top: scrollAdjustment,
                behavior: 'smooth'
            });
            
            // Update active state after snap
            setTimeout(() => updateActiveItem(column), SNAP_UPDATE_DELAY);
        }
    } catch (error) {
        console.error('Error in snapToItem:', error);
        selectMiddleItemAsFallback(column);
    }
}

// Update active item based on center position
function updateActiveItem(column) {
    try {
        const container = column.querySelector('.items-container');
        const items = Array.from(column.querySelectorAll('.jewelry-item'));
        
        if (items.length === 0) return;
        
        const containerRect = container.getBoundingClientRect();
        const centerY = containerRect.top + containerRect.height / 2;
        
        // Find item closest to center
        let activeItem = null;
        let minDistance = Infinity;
        
        items.forEach(item => {
            const itemRect = item.getBoundingClientRect();
            const itemCenterY = itemRect.top + itemRect.height / 2;
            const distance = Math.abs(itemCenterY - centerY);
            
            // Remove previous active states
            item.classList.remove('active', 'inactive');
            
            if (distance < minDistance) {
                minDistance = distance;
                activeItem = item;
            }
        });
        
        // Apply active/inactive states
        if (activeItem && minDistance < SNAP_THRESHOLD) {
            activeItem.classList.add('active');
            
            // Mark others as inactive
            items.forEach(item => {
                if (item !== activeItem) {
                    item.classList.add('inactive');
                }
            });
        }
    } catch (error) {
        console.error('Error in updateActiveItem:', error);
    }
}

// Select an item with visual feedback
function selectItem(item, column) {
    try {
        // Remove previous selection
        const previousSelection = document.querySelector('.jewelry-item.selected');
        if (previousSelection) {
            previousSelection.classList.remove('selected', 'pulse');
        }
        
        // Add pulse animation
        item.classList.add('pulse');
        setTimeout(() => item.classList.remove('pulse'), PULSE_DURATION);
        
        // Add ping animation effect (using lightweight approach)
        const pingElement = document.createElement('div');
        pingElement.className = 'jewelry-item ping';
        pingElement.style.position = 'absolute';
        pingElement.style.pointerEvents = 'none';
        pingElement.style.top = item.offsetTop + 'px';
        pingElement.style.left = item.offsetLeft + 'px';
        pingElement.style.width = item.offsetWidth + 'px';
        pingElement.style.height = item.offsetHeight + 'px';
        item.parentElement.appendChild(pingElement);
        setTimeout(() => pingElement.remove(), PING_DURATION);
        
        // Update selection
        item.classList.add('selected');
        selectedItem = {
            id: item.dataset.itemId,
            name: item.dataset.name,
            price: item.dataset.price,
            element: item
        };
        
        // Update confirm button state
        updateConfirmButton();
        
        // Scroll item into center view
        const container = column.querySelector('.items-container');
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const centerY = containerRect.top + containerRect.height / 2;
        const itemCenterY = itemRect.top + itemRect.height / 2;
        const scrollAdjustment = itemCenterY - centerY;
        
        container.scrollBy({
            top: scrollAdjustment,
            behavior: 'smooth'
        });
        
    } catch (error) {
        console.error('Error in selectItem:', error);
        selectMiddleItemAsFallback(column);
    }
}

// Fallback: select middle item if selection fails
function selectMiddleItemAsFallback(column) {
    try {
        const items = Array.from(column.querySelectorAll('.jewelry-item'));
        if (items.length > 0) {
            const middleIndex = Math.floor(items.length / 2);
            const middleItem = items[middleIndex];
            
            // Scroll to middle item
            const container = column.querySelector('.items-container');
            const containerRect = container.getBoundingClientRect();
            const itemRect = middleItem.getBoundingClientRect();
            const centerY = containerRect.top + containerRect.height / 2;
            const itemCenterY = itemRect.top + itemRect.height / 2;
            const scrollAdjustment = itemCenterY - centerY;
            
            container.scrollBy({
                top: scrollAdjustment,
                behavior: 'smooth'
            });
            
            updateActiveItem(column);
        }
    } catch (error) {
        console.error('Error in selectMiddleItemAsFallback:', error);
    }
}

// Initialize confirm button
function initializeConfirmButton() {
    const button = document.getElementById('confirmButton');
    
    button.addEventListener('click', () => {
        if (selectedItem) {
            alert(`You selected:\n${selectedItem.name}\nPrice: ${selectedItem.price}\n\nThank you for shopping at L'Élite Atelier!`);
        }
    });
}

// Update confirm button state
function updateConfirmButton() {
    const button = document.getElementById('confirmButton');
    
    // Enable only when a valid item is selected
    if (selectedItem && selectedItem.id && selectedItem.element) {
        button.disabled = false;
    } else {
        button.disabled = true;
    }
}

// Initialize tooltips with hover delay
function initializeTooltips() {
    const tooltip = document.getElementById('tooltip');
    const items = document.querySelectorAll('.jewelry-item');
    
    items.forEach(item => {
        item.addEventListener('mouseenter', (e) => {
            clearTimeout(tooltipTimeout);
            
            tooltipTimeout = setTimeout(() => {
                const name = item.dataset.name;
                const price = item.dataset.price;
                tooltip.textContent = `${name} - ${price}`;
                tooltip.classList.add('visible');
                
                // Position tooltip
                const rect = item.getBoundingClientRect();
                tooltip.style.left = `${rect.left + rect.width / 2}px`;
                tooltip.style.top = `${rect.top - 10}px`;
                tooltip.style.transform = 'translate(-50%, -100%)';
            }, TOOLTIP_DELAY);
        });
        
        item.addEventListener('mouseleave', () => {
            clearTimeout(tooltipTimeout);
            tooltip.classList.remove('visible');
        });
    });
}

// Ensure confirm button starts disabled
updateConfirmButton();
