// leaderboard.js - Fetch and render both multiplayer and solo leaderboard data

(function () {
    'use strict';

    // Multiplayer elements
    const multiWrap = document.getElementById('multi-table-wrap');
    const multiTbody = document.getElementById('leaderboard-body');
    const multiTable = document.getElementById('leaderboard-table');
    const multiEmpty = document.getElementById('leaderboard-empty');

    // Solo elements
    const soloWrap = document.getElementById('solo-table-wrap');
    const soloTbody = document.getElementById('solo-body');
    const soloTable = document.getElementById('solo-table');
    const soloEmpty = document.getElementById('solo-empty');

    // Tabs
    const tabMulti = document.getElementById('tab-multi');
    const tabSolo = document.getElementById('tab-solo');

    let activeTab = 'multiplayer';

    tabMulti.addEventListener('click', () => switchTab('multiplayer'));
    tabSolo.addEventListener('click', () => switchTab('solo'));

    function switchTab(tab) {
        activeTab = tab;
        tabMulti.classList.toggle('active', tab === 'multiplayer');
        tabSolo.classList.toggle('active', tab === 'solo');
        multiWrap.style.display = tab === 'multiplayer' ? 'block' : 'none';
        soloWrap.style.display = tab === 'solo' ? 'block' : 'none';
    }

    // ═══════ MULTIPLAYER LEADERBOARD ═══════
    async function loadMultiplayer() {
        try {
            const res = await fetch('/api/leaderboard');
            const data = await res.json();

            if (!data || data.length === 0) {
                multiTable.style.display = 'none';
                multiEmpty.style.display = 'block';
                return;
            }

            multiTable.style.display = 'table';
            multiEmpty.style.display = 'none';
            multiTbody.innerHTML = '';

            data.forEach((entry, i) => {
                const tr = document.createElement('tr');
                const rank = i + 1;
                let rankClass = '';
                if (rank === 1) rankClass = 'lb-rank-1';
                else if (rank === 2) rankClass = 'lb-rank-2';
                else if (rank === 3) rankClass = 'lb-rank-3';

                tr.innerHTML = `
          <td class="lb-rank ${rankClass}">#${rank}</td>
          <td class="lb-name">${escapeHtml(entry.name)}</td>
          <td class="lb-wins">${entry.wins}</td>
          <td class="lb-games">${entry.gamesPlayed}</td>
          <td class="lb-score">${entry.score}</td>
        `;
                multiTbody.appendChild(tr);
            });
        } catch (err) {
            multiTable.style.display = 'none';
            multiEmpty.style.display = 'block';
        }
    }

    // ═══════ SOLO LEADERBOARD ═══════
    async function loadSolo() {
        try {
            const res = await fetch('/api/leaderboard/solo');
            const data = await res.json();

            if (!data || data.length === 0) {
                soloTable.style.display = 'none';
                soloEmpty.style.display = 'block';
                return;
            }

            soloTable.style.display = 'table';
            soloEmpty.style.display = 'none';
            soloTbody.innerHTML = '';

            data.forEach((entry, i) => {
                const tr = document.createElement('tr');
                const rank = i + 1;
                let rankClass = '';
                if (rank === 1) rankClass = 'lb-rank-1';
                else if (rank === 2) rankClass = 'lb-rank-2';
                else if (rank === 3) rankClass = 'lb-rank-3';

                const mins = Math.floor(entry.survivalTime / 60);
                const secs = entry.survivalTime % 60;
                const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                const modeLabel = entry.mode === 'classic' ? '🐍 Classic' : '⚔️ Arena';

                tr.innerHTML = `
          <td class="lb-rank ${rankClass}">#${rank}</td>
          <td class="lb-name">${escapeHtml(entry.name)}</td>
          <td class="lb-score">${entry.score}</td>
          <td class="lb-time">${timeStr}</td>
          <td class="lb-mode">${modeLabel}</td>
        `;
                soloTbody.appendChild(tr);
            });
        } catch (err) {
            soloTable.style.display = 'none';
            soloEmpty.style.display = 'block';
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function loadAll() {
        loadMultiplayer();
        loadSolo();
    }

    loadAll();
    setInterval(loadAll, 30000);
})();
