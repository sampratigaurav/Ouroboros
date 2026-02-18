// leaderboard.js - In-memory leaderboard storage (multiplayer + solo)

class Leaderboard {
  constructor() {
    this.entries = new Map(); // playerName -> { wins, score, gamesPlayed }
    this.soloEntries = []; // [{ name, score, survivalTime, mode, date }]
  }

  // ── Multiplayer ──
  recordWin(playerName, score) {
    const entry = this.entries.get(playerName) || { wins: 0, score: 0, gamesPlayed: 0 };
    entry.wins += 1;
    entry.score += score;
    entry.gamesPlayed += 1;
    this.entries.set(playerName, entry);
  }

  recordGame(playerName, score) {
    const entry = this.entries.get(playerName) || { wins: 0, score: 0, gamesPlayed: 0 };
    entry.score += score;
    entry.gamesPlayed += 1;
    this.entries.set(playerName, entry);
  }

  getTopPlayers(limit = 20) {
    const sorted = Array.from(this.entries.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.wins - a.wins || b.score - a.score);
    return sorted.slice(0, limit);
  }

  getPlayerStats(playerName) {
    return this.entries.get(playerName) || null;
  }

  // ── Solo ──
  recordSoloScore(name, score, survivalTime, mode) {
    this.soloEntries.push({
      name: String(name).substring(0, 16),
      score: Math.max(0, Math.floor(Number(score) || 0)),
      survivalTime: Math.max(0, Math.floor(Number(survivalTime) || 0)),
      mode: mode === 'classic' ? 'classic' : 'arena',
      date: Date.now()
    });
    // Keep last 500 entries to avoid memory bloat
    if (this.soloEntries.length > 500) {
      this.soloEntries = this.soloEntries.slice(-500);
    }
  }

  getTopSoloScores(limit = 20) {
    return [...this.soloEntries]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

module.exports = new Leaderboard();
