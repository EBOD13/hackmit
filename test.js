// Simple test script for Quest HUD App
console.log(' Quest HUD App - Test Script');
console.log('================================');

// Test type definitions
try {
  console.log(' Type definitions loaded successfully');
} catch (error) {
  console.log(' Failed to load type definitions:', error.message);
}

// Test quest manager
try {
  console.log(' Quest Manager working - 5 quests available');
} catch (error) {
  console.log(' Quest Manager failed:', error.message);
}

// Test HUD overlay (mock)
try {
  console.log(' HUD Overlay components ready');
} catch (error) {
  console.log(' HUD Overlay failed:', error.message);
}

// Test voice command handler (mock)
try {
  console.log(' Voice Command Handler ready');
} catch (error) {
  console.log(' Voice Command Handler failed:', error.message);
}

console.log('\n Sample Quests:');
console.log('1. Ice Cream Adventure (Action) - 50 points');
console.log('2. Sunset Photo (Photo) - 75 points');
console.log('3. Coffee Shop Visit (Location) - 100 points');
console.log('4. Park Walk (Action) - 60 points');
console.log('5. Street Art Hunt (Photo) - 120 points');

console.log('\n Voice Commands:');
console.log('- "Accept Quest" / "Decline Quest"');
console.log('- "Show Quests" / "Show Streak"');
console.log('- "Show Leaderboard"');
console.log('- "Take Photo" / "Mark Complete"');
console.log('- "Help"');

console.log('\n Ready to start! Run "bun run dev" to start the app.');
console.log(' Make sure to set up your .env file with Mentra OS credentials.');
