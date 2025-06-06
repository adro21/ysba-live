// Test script to verify team mapping
const TEAM_NAME_MAPPING = {
  '511105': 'Midland Penetang Twins 9U DS',
  '511106': 'Aurora-King Jays 9U DS',
  '511107': 'Barrie Baycats 9U DS', 
  '511108': 'Bradford Tigers 9U DS',
  '511109': 'Midland Penetang Twins 9U DS',
  '511110': 'Newmarket Hawks 9U DS',
  '511111': 'Markham Mariners 9U DS',
  '511112': 'Orillia Royals 9U DS',
  '511113': 'Richmond Hill Phoenix 9U DS',
  '511114': 'Thornhill Reds 9U DS',
  '511115': 'Stouffville Yankees 9U DS',
  '511116': 'Caledon Nationals 9U HS',
  '518965': 'Vaughan Vikings 8U DS',
  '518966': 'Vaughan Vikings 9U DS'
};

console.log('Testing team mapping:');
console.log('511105 ->', TEAM_NAME_MAPPING['511105']);
console.log('518966 ->', TEAM_NAME_MAPPING['518966']);
console.log('511114 ->', TEAM_NAME_MAPPING['511114']);

// Test win percentage calculation for leagues that allow ties
function calculateWinPercentage(wins, losses, ties, gamesPlayed) {
  let winPercentage = '0.0';
  const calculatedGames = wins + losses + ties;
  const actualGames = (gamesPlayed > 0) ? gamesPlayed : calculatedGames;
  
  console.log(`GP:${gamesPlayed}, W:${wins}, L:${losses}, T:${ties}, ActualGames:${actualGames}`);
  
  if (actualGames > 0 && wins >= 0 && !isNaN(wins) && !isNaN(actualGames)) {
    // Formula: PCT = (Wins + 0.5 * Ties) / Games Played
    const percentage = ((wins + 0.5 * ties) / actualGames) * 100;
    console.log(`Calculated percentage: ${percentage} (with ties counted as 0.5 wins)`);
    
    if (!isNaN(percentage) && isFinite(percentage)) {
      winPercentage = percentage.toFixed(1);
    } else {
      winPercentage = '0.0';
    }
  }
  
  return winPercentage;
}

console.log('\nTesting win percentage calculation:');
console.log('4W-4L-0T, GP=0 ->', calculateWinPercentage(4, 4, 0, 0));
console.log('4W-2L-2T, GP=0 ->', calculateWinPercentage(4, 2, 2, 0));
console.log('2W-2L-0T, GP=4 ->', calculateWinPercentage(2, 2, 0, 4));
console.log('0W-1L-1T, GP=2 (TNT Thunder case) ->', calculateWinPercentage(0, 1, 1, 2));
console.log('1W-0L-1T, GP=2 ->', calculateWinPercentage(1, 0, 1, 2));
console.log('0W-0L-2T, GP=2 ->', calculateWinPercentage(0, 0, 2, 2)); 