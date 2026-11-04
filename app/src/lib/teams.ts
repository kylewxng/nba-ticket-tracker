// Short names for every NBA team, by tricode.
const TEAMS: Record<string, { city: string; name: string }> = {
  ATL: { city: 'Atlanta', name: 'Hawks' }, BOS: { city: 'Boston', name: 'Celtics' },
  BKN: { city: 'Brooklyn', name: 'Nets' }, CHA: { city: 'Charlotte', name: 'Hornets' },
  CHI: { city: 'Chicago', name: 'Bulls' }, CLE: { city: 'Cleveland', name: 'Cavaliers' },
  DAL: { city: 'Dallas', name: 'Mavericks' }, DEN: { city: 'Denver', name: 'Nuggets' },
  DET: { city: 'Detroit', name: 'Pistons' }, GSW: { city: 'Golden State', name: 'Warriors' },
  HOU: { city: 'Houston', name: 'Rockets' }, IND: { city: 'Indiana', name: 'Pacers' },
  LAC: { city: 'LA', name: 'Clippers' }, LAL: { city: 'Los Angeles', name: 'Lakers' },
  MEM: { city: 'Memphis', name: 'Grizzlies' }, MIA: { city: 'Miami', name: 'Heat' },
  MIL: { city: 'Milwaukee', name: 'Bucks' }, MIN: { city: 'Minnesota', name: 'Timberwolves' },
  NOP: { city: 'New Orleans', name: 'Pelicans' }, NYK: { city: 'New York', name: 'Knicks' },
  OKC: { city: 'Oklahoma City', name: 'Thunder' }, ORL: { city: 'Orlando', name: 'Magic' },
  PHI: { city: 'Philadelphia', name: '76ers' }, PHX: { city: 'Phoenix', name: 'Suns' },
  POR: { city: 'Portland', name: 'Trail Blazers' }, SAC: { city: 'Sacramento', name: 'Kings' },
  SAS: { city: 'San Antonio', name: 'Spurs' }, TOR: { city: 'Toronto', name: 'Raptors' },
  UTA: { city: 'Utah', name: 'Jazz' }, WAS: { city: 'Washington', name: 'Wizards' },
}

export const HOME_TEAMS = ['LAL', 'LAC'] as const

export function teamName(tricode: string): string {
  return TEAMS[tricode]?.name ?? tricode
}

export function matchup(game: { away_tricode: string; home_tricode: string }): string {
  return `${teamName(game.away_tricode)} at ${teamName(game.home_tricode)}`
}
