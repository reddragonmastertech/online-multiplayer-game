export type Currency = "rac" | "usdt";
export type Move = "Choosing" | "Rock" | "Paper" | "Scissors";

export const panelClass =
  "rounded-2xl border border-white/10 bg-[#0c1422] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]";

export const lobbyStats = {
  connected: "1087 connected",
  playing: "330 playing",
  chatOnline: "1,097 Online",
};

export const featuredMatch = {
  left: { name: "cyer", avatar: 68 },
  right: { name: "Dqok", avatar: 21 },
  elapsed: "00:41",
  duration: "00:15",
};

export const dailyMissions = [
  { id: "matches", label: "Play 3 Matches", progress: "0/3", reward: "+10 RAC", currency: "rac" },
  { id: "rounds", label: "Play 10 Rounds", progress: "0/10", reward: "+10 RAC", currency: "rac" },
  { id: "video", label: "Watch 1 Live Video", progress: "0/1", reward: "+10 RAC", currency: "rac" },
] as const;

export const totalMissions = [
  {
    id: "usdt-wins",
    label: "Win 10 USDT matches",
    progress: "0/10",
    reward: "+0.1 USDT",
    currency: "usdt",
  },
  {
    id: "rac-wins",
    label: "Win 10 RAC matches",
    progress: "0/10",
    reward: "+0.1 USDT",
    currency: "usdt",
  },
] as const;

export const stakes = [
  { amount: "1 RAC", playing: 54, currency: "rac" },
  { amount: "5 RAC", playing: 73, currency: "rac" },
  { amount: "10 RAC", playing: 54, currency: "rac" },
  { amount: "0.1 USDT", playing: 34, currency: "usdt" },
  { amount: "0.2 USDT", playing: 8, currency: "usdt" },
  { amount: "0.5 USDT", playing: 18, currency: "usdt" },
] as const;

export const recentWinners = [
  { name: "smith611", amount: "+10 RAC", currency: "rac", avatar: 12 },
  { name: "phantom", amount: "+20 RAC", currency: "rac", avatar: 33 },
  { name: "8751", amount: "+1 USDT", currency: "usdt", avatar: 5 },
  { name: "emma3481", amount: "+0.36 USDT", currency: "usdt", avatar: 47 },
] as const;

type Player = { name: string; avatar: number; score: number; move: Move };

export type LiveMatch = {
  id: string;
  stake: string;
  currency: Currency;
  round: number;
  countdown?: number;
  winner?: string;
  left: Player;
  right: Player;
};

export const liveMatches: LiveMatch[] = [
  {
    id: "m1",
    stake: "1 RAC",
    currency: "rac",
    round: 2,
    countdown: 3,
    left: { name: "comet9206G", avatar: 11, score: 0, move: "Choosing" },
    right: { name: "cobra8481", avatar: 18, score: 1, move: "Choosing" },
  },
  {
    id: "m2",
    stake: "5 RAC",
    currency: "rac",
    round: 1,
    countdown: 4,
    left: { name: "Taylor119", avatar: 15, score: 0, move: "Choosing" },
    right: { name: "young", avatar: 22, score: 0, move: "Choosing" },
  },
  {
    id: "m3",
    stake: "1 RAC",
    currency: "rac",
    round: 2,
    winner: "june0925",
    left: { name: "june0925", avatar: 28, score: 2, move: "Rock" },
    right: { name: "lee", avatar: 32, score: 1, move: "Scissors" },
  },
  {
    id: "m4",
    stake: "0.1 USDT",
    currency: "usdt",
    round: 3,
    winner: "Draw",
    left: { name: "wealth", avatar: 41, score: 1, move: "Rock" },
    right: { name: "ISABELLA01", avatar: 45, score: 1, move: "Rock" },
  },
  {
    id: "m5",
    stake: "10 RAC",
    currency: "rac",
    round: 3,
    winner: "Liam",
    left: { name: "TitanClean", avatar: 7, score: 2, move: "Scissors" },
    right: { name: "Sam", avatar: 9, score: 1, move: "Rock" },
  },
  {
    id: "m6",
    stake: "10 RAC",
    currency: "rac",
    round: 3,
    countdown: 2,
    left: { name: "MATEO", avatar: 52, score: 1, move: "Choosing" },
    right: { name: "ghost", avatar: 60, score: 1, move: "Choosing" },
  },
  {
    id: "m7",
    stake: "5 RAC",
    currency: "rac",
    round: 2,
    countdown: 11,
    left: { name: "rider_844", avatar: 36, score: 1, move: "Choosing" },
    right: { name: "MARB", avatar: 14, score: 0, move: "Choosing" },
  },
  {
    id: "m8",
    stake: "0.5 USDT",
    currency: "usdt",
    round: 3,
    winner: "B296",
    left: { name: "B296", avatar: 49, score: 2, move: "Paper" },
    right: { name: "2587", avatar: 8, score: 1, move: "Rock" },
  },
];

export type ChatMessage = {
  id: string;
  name: string;
  avatar: number;
  when: string;
  text?: string;
  image?: string;
};

export const chatMessages: ChatMessage[] = [
  { id: "c1", name: "bal", avatar: 3, when: "Aug 21", text: "100" },
  {
    id: "c2",
    name: "Alkadev",
    avatar: 51,
    when: "Sep 13",
    image: "alkadev-shot",
  },
  { id: "c3", name: "HI", avatar: 16, when: "Oct 3", text: "Hi" },
  { id: "c4", name: "WO", avatar: 24, when: "Oct 3", text: "WO" },
  { id: "c5", name: "WOW", avatar: 27, when: "Oct 3", text: "WOW" },
  { id: "c6", name: "HI", avatar: 31, when: "Oct 3", text: "This is perfect site." },
  { id: "c7", name: "HI", avatar: 38, when: "Oct 3", text: "I am looking forward this site." },
  { id: "c8", name: "HI", avatar: 44, when: "Oct 3", text: "I will pay." },
  { id: "c9", name: "Guest308F", avatar: 63, when: "1d", text: "Hi" },
];

export const emojis = ["👍", "🔥", "😂", "😮", "❤️", "👏", "⚡", "🎉"];

export const stickers = ["crown", "fist", "coin", "trophy", "flame", "star", "gem", "rocket"];
