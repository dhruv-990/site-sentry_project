document.addEventListener('DOMContentLoaded', () => {
    const timeList = document.getElementById('timeList');
    const clearDataBtn = document.getElementById('clearDataBtn');
    const pauseTrackingBtn = document.getElementById('pauseTrackingBtn');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const totalTimeElement = document.getElementById('totalTime');

    if (!clearDataBtn || !pauseTrackingBtn || !darkModeToggle || !totalTimeElement) {
        console.error("Required elements not found!");
        return;
    }

    let activeTabTimeElement = null;
    let activeTabInterval = null;
    let isTrackingPaused = false;
    let isDarkMode = false;

    // Load dark mode preference from storage
    chrome.storage.local.get('isDarkMode', (data) => {
        if (data.isDarkMode !== undefined) {
            isDarkMode = data.isDarkMode;
            darkModeToggle.checked = isDarkMode;
            document.body.classList.toggle('dark-mode', isDarkMode);
        }
    });

    function getDomainName(url) {
        try {
            const domain = new URL(`https://${url}`).hostname.replace(/^www\./, '').split('.')[0];
            return domain.charAt(0).toUpperCase() + domain.slice(1);
        } catch {
            return url;
        }
    }

    function getFavicon(url) {
        return `https://www.google.com/s2/favicons?sz=32&domain=${url}`;
    }

    function formatTime(seconds) {
        let h = Math.floor(seconds / 3600);
        let m = Math.floor((seconds % 3600) / 60);
        let s = Math.floor(seconds % 60);
        return `${h ? h + 'h ' : ''}${m ? m + 'm ' : ''}${s}s`;
    }

    function updatePopup() {
        chrome.runtime.sendMessage({ action: 'getTimeData' }, (response) => {
            if (!response) return;

            const timeData = response.timeSpent || {};
            const activeTab = response.activeTab;
            isTrackingPaused = response.isTrackingPaused || false;

            // Update pause/resume button text
            pauseTrackingBtn.textContent = isTrackingPaused ? "Resume Tracking" : "Pause Tracking";

            // Clear the list except for the active tab's time element
            timeList.innerHTML = '';

            // Convert time data to array and sort by time spent in descending order
            let sortedEntries = Object.entries(timeData).sort((a, b) => b[1] - a[1]);

            // Calculate total time spent
            let totalTime = 0;
            sortedEntries.forEach(([site, time]) => {
                totalTime += time;
            });

            // Display total time
            totalTimeElement.textContent = `Total Time: ${formatTime(totalTime)}`;

            // Add active tab to the top if it exists
            if (activeTab && timeData[activeTab] !== undefined) {
                sortedEntries = sortedEntries.filter(([site]) => site !== activeTab);
                sortedEntries.unshift([activeTab, timeData[activeTab]]);
            }

            // Render the list
            sortedEntries.forEach(([site, time]) => {
                const div = document.createElement('div');
                div.className = 'site';

                const icon = document.createElement('img');
                icon.src = getFavicon(site);
                icon.className = 'site-icon';
                icon.onerror = () => (icon.style.display = 'none');

                const name = document.createElement('span');
                name.className = 'site-name';
                name.textContent = getDomainName(site);

                const timeText = document.createElement('span');
                timeText.className = 'site-time';
                timeText.textContent = formatTime(time);

                div.appendChild(icon);
                div.appendChild(name);
                div.appendChild(timeText);
                timeList.appendChild(div);

                // Track the active tab's time element
                if (site === activeTab) {
                    activeTabTimeElement = timeText;
                }
            });

            // Update the active tab's time dynamically only if tracking is not paused
            if (activeTab && response.startTime && !isTrackingPaused) {
                if (activeTabInterval) clearInterval(activeTabInterval);
                activeTabInterval = setInterval(() => {
                    if (activeTabTimeElement) {
                        const currentTime = Math.floor((Date.now() - response.startTime) / 1000);
                        const totalTimeForActiveTab = (timeData[activeTab] || 0) + currentTime;
                        activeTabTimeElement.textContent = formatTime(totalTimeForActiveTab);

                        // Recalculate and update total time
                        let newTotalTime = 0;
                        Object.values(timeData).forEach((time) => {
                            newTotalTime += time;
                        });
                        newTotalTime += currentTime;
                        totalTimeElement.textContent = `Total Time: ${formatTime(newTotalTime)}`;
                    }
                }, 1000);
            } else {
                if (activeTabInterval) clearInterval(activeTabInterval);
            }
        });
    }

    // Clear Data Button
    clearDataBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'clearData' }, () => {
            updatePopup();
        });
    });

    // Pause/Resume Tracking Button
    pauseTrackingBtn.addEventListener('click', () => {
        isTrackingPaused = !isTrackingPaused;
        chrome.runtime.sendMessage({ action: 'setTrackingState', paused: isTrackingPaused }, () => {
            updatePopup();
        });
    });

    // Dark Mode Toggle Switch
    darkModeToggle.addEventListener('change', () => {
        isDarkMode = darkModeToggle.checked;
        document.body.classList.toggle('dark-mode', isDarkMode);
        chrome.storage.local.set({ isDarkMode });
    });

    // Export to Excel Button
    document.getElementById('exportToExcelBtn').addEventListener('click', exportToExcel);

    function exportToExcel() {
        chrome.runtime.sendMessage({ action: 'getTimeData' }, (response) => {
            if (!response) return;

            const timeData = response.timeSpent || {};
            const activeTab = response.activeTab;
            const isTrackingPaused = response.isTrackingPaused || false;
            
            let sortedEntries = Object.entries(timeData).sort((a, b) => b[1] - a[1]);
            
            let totalTime = 0;
            sortedEntries.forEach(([site, time]) => {
                totalTime += time;
            });
            
            if (activeTab && !isTrackingPaused && response.startTime) {
                const currentTime = Math.floor((Date.now() - response.startTime) / 1000);
                totalTime += currentTime;
                
                const existingIndex = sortedEntries.findIndex(([site]) => site === activeTab);
                if (existingIndex >= 0) {
                    sortedEntries[existingIndex][1] += currentTime;
                } else {
                    sortedEntries.unshift([activeTab, currentTime]);
                }
            }
            
            let csvContent = "Website,Time Spent (seconds),Time Spent (HH:MM:SS)\n";
            
            sortedEntries.forEach(([site, time]) => {
                const formattedTime = formatTime(time);
                csvContent += `"${site}",${time},"${formattedTime}"\n`;
            });
            
            const formattedTotalTime = formatTime(totalTime);
            csvContent += `"Total",${totalTime},"${formattedTotalTime}"\n`;
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `time_tracking_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    updatePopup();
});