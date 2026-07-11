var buying = true

function setOperation(op, button) {
    buying = op  === "buying";
    console.log('Operation set to:', op);
    button.parentNode.querySelectorAll('button').forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');
}

function cancelOperation(operationId) {
    console.log('Canceling operation:', operationId);
    // Add logic to cancel the specific operation
}

function cancelAllOperations() {
    console.log('Canceling all operations');
    // Add logic to cancel all operations
}

function initTimeInterval() {
    const timeInterval = document.getElementById('timeInterval');
    const timeIntervalValue = document.getElementById('timeIntervalValue');
    
    if (!timeInterval || !timeIntervalValue) return;
    
    function logSlider(position) {
        // position will be between 0 and 100
        const minp = 0;
        const maxp = 100;

        // The result should be between 1 minute and 1 day (in minutes)
        const minv = Math.log(10);
        const maxv = Math.log(1440*7);

        // calculate adjustment factor
        const scale = (maxv - minv) / (maxp - minp);

        return Math.exp(minv + scale * (position - minp));
    }

    function formatTime(minutes) {
        if (minutes < 60) {
            return Math.round(minutes) + ' minutes';
        } else if (minutes < 1440) {
            return (minutes / 60).toFixed(1) + ' hours';
        } else {              
            return (minutes / 60/24).toFixed(1) + ' days';
        }
    }

    timeInterval.addEventListener('input', function() {
        const logValue = logSlider(this.value);
        timeIntervalValue.textContent = formatTime(logValue);
    });

    // Initialize the slider value
    timeInterval.value = 60;
    timeInterval.dispatchEvent(new Event('input'));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTimeInterval);
} else {
    initTimeInterval();
}

function activateCoin(coin) {
    const input = document.getElementById('coinInput');
    if (input) {
        input.value = '';
        input.placeholder = coin;
    }
    document.querySelectorAll('.coin-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.coin === coin);
    });
    if (typeof changeCoin === 'function') {
        changeCoin(coin);
    }
}

function filterCoinSuggestions(query) {
    if (!query || typeof coins === 'undefined') return [];
    const q = query.toUpperCase().trim();
    if (!q) return [];
    return coins.filter(c => c.includes(q)).slice(0, 10);
}

function handleCoinInput() {
    const input = document.getElementById('coinInput');
    const dropdown = document.getElementById('coinDropdown');
    const btnBox = document.getElementById('coin-buttons');
    
    if (!input || !dropdown || !btnBox) {
        // Retry after a short delay
        setTimeout(handleCoinInput, 50);
        return;
    }
    
    // Check if required variables are available
    if (typeof coinParam === 'undefined' || typeof coins === 'undefined') {
        // Retry after a short delay
        setTimeout(handleCoinInput, 50);
        return;
    }
    
    // Set initial value but don't show it in the input (will be shown via placeholder)
    input.value = '';
    input.placeholder = coinParam;
    
    // Track if input has been focused
    let hasBeenFocused = false;
    
    // Create quick buttons for BTC, ETH, and HYPE
    const quick = ['BTC', 'ETH', 'HYPE'];
    quick.forEach(c => {
        if (coins.includes(c)) {
            const btn = document.createElement('button');
            btn.textContent = c;
            btn.className = 'btn btn-secondary coin-btn';
            btn.dataset.coin = c;
            btnBox.appendChild(btn);
        }
    });
    
    // Update button active states
    document.querySelectorAll('.coin-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.coin === coinParam);
    });
    
    // Clear input on first focus
    input.addEventListener('focus', () => {
        if (!hasBeenFocused) {
            hasBeenFocused = true;
            input.value = '';
            input.placeholder = 'BTC';
        }
    });
    
    // Dropdown functions
    function closeDropdown() {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    }
    
    function openDropdown(suggestions) {
        dropdown.innerHTML = '';
        if (suggestions.length === 0) {
            closeDropdown();
            return;
        }
        
        // Calculate position relative to viewport
        const inputRect = input.getBoundingClientRect();
        dropdown.style.left = inputRect.left + 'px';
        dropdown.style.top = (inputRect.bottom + 6) + 'px';
        dropdown.style.width = inputRect.width + 'px';
        
        suggestions.forEach(coin => {
            const item = document.createElement('div');
            item.className = 'comps-ddItem';
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.innerHTML = `<div class="sym">${coin}</div>`;
            item.addEventListener('click', () => {
                activateCoin(coin);
                closeDropdown();
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    item.click();
                }
            });
            dropdown.appendChild(item);
        });
        dropdown.style.display = 'block';
    }
    
    // Handle input changes
    input.addEventListener('input', () => {
        const suggestions = filterCoinSuggestions(input.value);
        openDropdown(suggestions);
    });
    
    // Handle Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value.toUpperCase().trim();
            if (value && coins.includes(value)) {
                activateCoin(value);
                closeDropdown();
            } else if (value) {
                alert(`Invalid coin: ${value}. Please select a valid coin from the list.`);
                input.value = '';
                input.placeholder = coinParam;
                closeDropdown();
            }
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== input) {
            closeDropdown();
        }
    });
    
    // Handle blur - validate and update coin if valid
    input.addEventListener('blur', () => {
        const value = input.value.toUpperCase().trim();
        if (value && coins.includes(value) && value !== coinParam) {
            if (typeof changeCoin === 'function') {
                changeCoin(value);
            }
        } else if (value && !coins.includes(value)) {
            input.value = '';
            input.placeholder = coinParam;
        } else if (!value) {
            // If empty, restore placeholder to current coin
            input.placeholder = coinParam;
        }
        // Don't close dropdown on blur, let click handler do it
    });
    
    // Handle button clicks
    btnBox.addEventListener('click', e => {
        if (e.target.classList.contains('coin-btn')) {
            activateCoin(e.target.dataset.coin);
            closeDropdown();
        }
    });
}

// Wait for DOM and dependencies
function initCoinInput() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(handleCoinInput, 200);
        });
    } else {
        setTimeout(handleCoinInput, 200);
    }
}

initCoinInput();