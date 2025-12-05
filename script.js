function createSpaceBackground() {
    const spaceBackground = document.getElementById('spaceBackground');

    for (let i = 0; i < 200; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 3;
        star.style.width = size + 'px';
        star.style.height = size + 'px';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDelay = Math.random() * 4 + 's';
        star.style.animationDuration = (Math.random() * 3 + 3) + 's';
        spaceBackground.appendChild(star);
    }

    function createComet() {
        const comet = document.createElement('div');
        comet.className = 'comet';
        comet.style.left = Math.random() * 100 + '%';
        comet.style.top = Math.random() * 50 + '%';
        comet.style.animationDuration = (Math.random() * 2 + 2) + 's';
        spaceBackground.appendChild(comet);
        setTimeout(() => comet.remove(), 3000);
    }

    setInterval(createComet, 2000);

    for (let i = 0; i < 3; i++) {
        const nebula = document.createElement('div');
        nebula.className = 'nebula';
        const size = Math.random() * 300 + 200;
        nebula.style.width = size + 'px';
        nebula.style.height = size + 'px';
        nebula.style.left = Math.random() * 100 + '%';
        nebula.style.top = Math.random() * 100 + '%';
        const colors = ['rgba(0, 255, 136, 0.3)', 'rgba(0, 212, 255, 0.3)', 'rgba(138, 43, 226, 0.3)'];
        nebula.style.background = colors[i % colors.length];
        nebula.style.animationDelay = i * 3 + 's';
        spaceBackground.appendChild(nebula);
    }
}

async function loadPlatforms() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/0xSaikat/findme/main/data.json');
        const data = await response.json();
        const platforms = {};
        for (const [key, value] of Object.entries(data)) {
            if (!key.startsWith('$') && typeof value === 'object' && value.url) {
                platforms[key] = value;
            }
        }
        return platforms;
    } catch (error) {
        console.error('Error loading platforms:', error);
        return {};
    }
}

let searchResults = [];
let showingAll = false;
let currentMode = 'discover'; // 'discover' or 'availability'

async function checkUsername(platform, username, platformName) {
    const url = platform.url.replace('{}', username);

    const corsProxy = 'https://corsproxy.io/?';
    const proxiedUrl = corsProxy + encodeURIComponent(url);

    try {
        const response = await fetch(proxiedUrl, {
            method: 'GET',
            redirect: 'follow'
        });

        // Check if username EXISTS on the platform
        // response.ok && status !== 404 means the profile page loaded = username EXISTS
        const usernameExists = response.ok && response.status !== 404;

        if (currentMode === 'availability') {
            // Availability mode: we want to find where username is NOT taken
            if (usernameExists) {
                // Username EXISTS = NOT available (taken)
                return { name: platformName, url: url, status: 'taken' };
            } else {
                // Username NOT FOUND = AVAILABLE for registration
                return { name: platformName, url: url, status: 'available' };
            }
        } else {
            // Discover mode: we want to find where username EXISTS
            if (usernameExists) {
                return { name: platformName, url: url, status: 'found' };
            } else {
                return { name: platformName, url: url, status: 'not_found' };
            }
        }
    } catch (error) {
        // Error checking - can't determine, skip this platform
        return null;
    }
}

function displayResults(results, showAll = false) {
    const resultsDiv = document.getElementById('results');
    const exportSection = document.getElementById('exportSection');
    const statsBar = document.getElementById('statsBar');
    const showMoreSection = document.getElementById('showMoreSection');

    const existingResults = resultsDiv.querySelectorAll('.result-item');

    // Update label based on mode
    const foundLabel = document.getElementById('foundLabel');
    if (foundLabel) {
        foundLabel.textContent = currentMode === 'availability' ? 'Available' : 'Found';
    }

    if (results.length === 0) {
        const noResultsMessage = currentMode === 'availability'
            ? 'Username is taken on all checked platforms.'
            : 'No accounts found. The username may not exist on these platforms.';
        resultsDiv.innerHTML = `<div class="no-results">${noResultsMessage}</div>`;
        exportSection.classList.remove('show');
        statsBar.classList.remove('show');
        showMoreSection.classList.remove('show');
    } else {
        const displayCount = showAll ? results.length : Math.min(6, results.length);

        if (showAll || existingResults.length !== displayCount) {
            resultsDiv.innerHTML = '';

            for (let i = 0; i < displayCount; i++) {
                const result = results[i];
                const resultItem = document.createElement('div');

                // Add availability-specific styling
                if (currentMode === 'availability') {
                    resultItem.className = 'result-item result-available';
                } else {
                    resultItem.className = 'result-item';
                }
                resultItem.style.animationDelay = (i * 0.05) + 's';

                const statusBadge = currentMode === 'availability'
                    ? '<span class="status-badge available">✓ Available</span>'
                    : '<span class="status-badge found">Found</span>';

                const buttonText = currentMode === 'availability' ? 'Register' : 'Visit';
                const buttonClass = currentMode === 'availability' ? 'register-btn' : 'visit-btn';

                resultItem.innerHTML = `
                    <span class="platform-name">${result.name}</span>
                    ${statusBadge}
                    <span class="result-url">${result.url}</span>
                    <div class="result-actions">
                        <a href="${result.url}" target="_blank" class="${buttonClass}">${buttonText}</a>
                    </div>
                `;
                resultsDiv.appendChild(resultItem);
            }
        }

        if (results.length > 6 && !showAll) {
            showMoreSection.classList.add('show');
            const label = currentMode === 'availability' ? 'Available' : 'Results';
            document.getElementById('showMoreBtn').textContent = `Show All ${results.length} ${label}`;
        } else {
            showMoreSection.classList.remove('show');
        }

        exportSection.classList.add('show');
        statsBar.classList.add('show');
    }

    resultsDiv.classList.add('show');
}

async function searchUsername(username) {
    const platforms = await loadPlatforms();
    const results = [];
    const platformEntries = Object.entries(platforms);

    document.getElementById('totalCount').textContent = platformEntries.length;
    document.getElementById('platformCount').textContent = platformEntries.length;
    document.getElementById('scannedCount').textContent = '0';
    document.getElementById('foundCount').textContent = '0';

    // Update label based on mode
    const foundLabel = document.getElementById('foundLabel');
    if (foundLabel) {
        foundLabel.textContent = currentMode === 'availability' ? 'Available' : 'Found';
    }

    searchResults = [];

    let scanned = 0;

    const checkingText = currentMode === 'availability' ? 'Checking availability:' : 'Checking:';

    for (let i = 0; i < platformEntries.length; i++) {
        const [name, platform] = platformEntries[i];

        document.getElementById('currentCheck').textContent = `${checkingText} ${name}`;

        const result = await checkUsername(platform, username, name);

        // Filter based on mode
        if (result) {
            const shouldInclude = currentMode === 'availability'
                ? result.status === 'available'
                : result.status === 'found';

            if (shouldInclude) {
                results.push(result);
                searchResults.push(result);
                document.getElementById('foundCount').textContent = results.length;
                displayResults(results, showingAll);
            }
        }

        scanned++;
        document.getElementById('scannedCount').textContent = scanned;

        await new Promise(resolve => setTimeout(resolve, 50));
    }

    const completeMessage = currentMode === 'availability'
        ? `Scan complete! Found ${results.length} available platforms.`
        : 'Scan complete!';
    document.getElementById('currentCheck').textContent = completeMessage;

    displayResults(results, showingAll);

    return results;
}

function exportAsJSON() {
    const dataStr = JSON.stringify(searchResults, null, 2);
    downloadFile(dataStr, 'findme-results.json', 'application/json');
}

function exportAsCSV() {
    let csv = 'Platform,URL\n';
    searchResults.forEach(result => {
        csv += `"${result.name}","${result.url}"\n`;
    });
    downloadFile(csv, 'findme-results.csv', 'text/csv');
}

function exportAsTXT() {
    let txt = 'FindMe Search Results\n';
    txt += '='.repeat(50) + '\n\n';
    searchResults.forEach(result => {
        txt += `${result.name}: ${result.url}\n`;
    });
    downloadFile(txt, 'findme-results.txt', 'text/plain');
}

function copyToClipboard() {
    let text = '';
    searchResults.forEach(result => {
        text += `${result.name}: ${result.url}\n`;
    });
    navigator.clipboard.writeText(text).then(() => {
        alert('Results copied to clipboard!');
    });
}

function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
}

document.getElementById('searchBtn').addEventListener('click', async () => {
    const username = document.getElementById('usernameInput').value.trim();

    if (!username) {
        alert('Please enter a username');
        return;
    }

    const searchBtn = document.getElementById('searchBtn');
    const loader = document.getElementById('loader');
    const results = document.getElementById('results');
    const exportSection = document.getElementById('exportSection');
    const statsBar = document.getElementById('statsBar');
    const showMoreSection = document.getElementById('showMoreSection');

    searchBtn.disabled = true;
    loader.classList.add('active');
    results.classList.remove('show');
    results.innerHTML = '';
    exportSection.classList.remove('show');
    showMoreSection.classList.remove('show');
    statsBar.classList.add('show');
    showingAll = false;

    const foundResults = await searchUsername(username);

    loader.classList.remove('active');
    searchBtn.disabled = false;
    displayResults(foundResults, false);
});

document.getElementById('showMoreBtn').addEventListener('click', () => {
    showingAll = true;

    if (searchResults.length > 0) {
        displayResults(searchResults, true);
    }
});

document.getElementById('usernameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('searchBtn').click();
    }
});

// Mode toggle functionality
function updateModeUI(mode) {
    currentMode = mode;
    const discoverBtn = document.getElementById('modeDiscover');
    const availabilityBtn = document.getElementById('modeAvailability');
    const modeDescription = document.getElementById('modeDescription');
    const searchBtn = document.getElementById('searchBtn');

    if (mode === 'availability') {
        discoverBtn.classList.remove('active');
        availabilityBtn.classList.add('active');
        modeDescription.textContent = 'Find platforms where this username is AVAILABLE for registration';
        modeDescription.className = 'mode-description availability';
        searchBtn.textContent = 'Check Availability';
        searchBtn.className = 'search-btn availability-btn';
    } else {
        discoverBtn.classList.add('active');
        availabilityBtn.classList.remove('active');
        modeDescription.textContent = 'Find where this username already exists';
        modeDescription.className = 'mode-description';
        searchBtn.textContent = 'Search Accounts';
        searchBtn.className = 'search-btn';
    }

    // Clear previous results
    document.getElementById('results').innerHTML = '';
    document.getElementById('results').classList.remove('show');
    document.getElementById('exportSection').classList.remove('show');
    document.getElementById('statsBar').classList.remove('show');
    document.getElementById('showMoreSection').classList.remove('show');
    searchResults = [];
}

document.getElementById('modeDiscover').addEventListener('click', () => {
    updateModeUI('discover');
});

document.getElementById('modeAvailability').addEventListener('click', () => {
    updateModeUI('availability');
});

createSpaceBackground();
