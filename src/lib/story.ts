export type Mood = "Nap" | "Jog" | "Zoomies";
export type Branch = 0 | 1 | 2;
export type Round = { id: bigint; work: bigint };
export const PATHS = [
  {
    name: "Follow the fireflies",
    detail: "A soft glow beyond the trees.",
    icon: "sparkles",
    place: "Firefly Hollow",
  },
  {
    name: "Cross the little bridge",
    detail: "See what is over the stream.",
    icon: "bridge",
    place: "Pebblebrook",
  },
  {
    name: "Find the hidden burrow",
    detail: "Someone left the door ajar.",
    icon: "home",
    place: "Cloverwood",
  },
] as const;
export function moodFor(work: bigint): Mood {
  return work === 0n ? "Nap" : work < 600n ? "Jog" : "Zoomies";
}
const STORIES: Record<Mood, readonly { title: string; text: string }[]> = {
  Nap: [
    {
      title: "A pocketful of starlight",
      text: "Squeek curls up beneath a clover leaf. Above his whiskers, a firefly blinks once, then twice.",
    },
    {
      title: "The softest place to pause",
      text: "The stream hums a sleepy little song. Squeek settles beside the bridge and tucks his map under one paw.",
    },
    {
      title: "A very small beginning",
      text: "In Cloverwood, Squeek finds a door just his size. A warm breeze carries the scent of toasted sunflower seeds.",
    },
  ],
  Jog: [
    {
      title: "A trail of tiny lanterns",
      text: "Squeek follows the lights into the hollow. A moth in a knitted scarf offers a crumb of cake.",
    },
    {
      title: "Across the whispering stream",
      text: "Squeek steps onto the little bridge. Below him, a pebble sparkles in the water, with a tiny arrow pointing downstream.",
    },
    {
      title: "The path less nibbled",
      text: "Squeek follows a trail of sunflower shells. Between the roots of an old oak, a little door stands open.",
    },
  ],
  Zoomies: [
    {
      title: "Catch a falling firefly",
      text: "Squeek races through the hollow, scarf streaming behind him. The fireflies spiral into an arrow pointing toward a walnut-shell boat.",
    },
    {
      title: "The great acorn dash",
      text: "An acorn rolls onto the bridge. Squeek gives chase and catches it with both paws. Something inside gives a tiny rattle.",
    },
    {
      title: "A knock, a squeak, a quest",
      text: "Squeek tumbles through the burrow door and lands in a mountain of cushions. A dozen tiny paws applaud his arrival.",
    },
  ],
};
const CONTINUATIONS = [
  "A tiny sign points onward. Squeek gives it a hopeful sniff.",
  "He folds his map. The next step is yours.",
  "Beyond the clover, another little adventure is waiting.",
] as const;
export function chapterFor(round: Round, branch: Branch = 2) {
  const mood = moodFor(round.work);
  return {
    ...STORIES[mood][branch],
    text: `${STORIES[mood][branch].text} ${CONTINUATIONS[Number((round.id - 1n) % 3n)]}`,
    mood,
    place: PATHS[branch].place,
    round: round.id,
    work: round.work,
  };
}
export const INTRO = {
  title: "A very small beginning",
  text: "At the edge of Cloverwood, Squeek unfolds a map bigger than his paws. Three paths curl into the trees. Every good adventure starts with a little curiosity. Which way should he go?",
  place: "Cloverwood",
};
export const rewardForRank = (rank: number) =>
  ((11 - rank) / 10_000).toFixed(rank === 1 ? 3 : 4);
export const utcDay = (seconds = Date.now() / 1000) =>
  Math.floor(seconds / 86_400);
export const dayLabel = (day: number) =>
  new Date(day * 86_400_000).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
