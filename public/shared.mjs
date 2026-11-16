export const MEMBERS = ['Anna A.', 'Anna K.', 'Asif', 'Kanika', 'Maja', 'Martina', 'Stanislav', 'Tomasz'];
export const FULL_NAMES = ['Anna Antoniuk', 'Anna Koprowicz-Boukoffa', 'Asif Nadeem Anjum', 'Kanika Jadhav Sharma', 'Maja Glina', 'Martina Chmurna', 'Stanislav Vdovin', 'Tomasz Pastuszka'];
export const VOTERS = [...MEMBERS, 'Ender'];
export const CATEGORIES = [
  ['Calmest in a Crisis', 'A steady hand when the unexpected happens.'],
  ['Best Question-Asker', 'The question that makes everyone think again.'],
  ['Chief Simplifier', 'Makes complicated things clear.'],
  ['Creative Fixer', 'Can make anything work with limited resources.'],
  ['The Glue', 'Holds the team together.'],
  ['Best Welcome Committee', 'Makes new people feel at home.'],
  ['Best Listener', 'Makes space for every voice.'],
  ['The Spark', 'Starts things, brings ideas.'],
  ['Most Likely to Volunteer First', 'Steps forward when it matters.'],
  ['Change Champion', 'Embraces new things.'],
  ['Most Likely to Reply Within Seconds', 'A little less waiting, a lot more helping.'],
  ['The Human Calendar', 'Always knows the dates and deadlines.'],
  ['Chief Optimist', 'Sees the possibility in what comes next.'],
  ['Best Email Writer', 'The right words, beautifully put.']
];
export const STAGES = [
  { name: 'Gather', minutes: 3, eyebrow: '01 / A little room for us', title: 'Three years.\nOne great team.', text: 'A pause to celebrate the people who make Hygge feel like Hygge.' },
  { name: 'Remember', minutes: 5, eyebrow: '02 / The good things stay', title: 'Small moments.\nLasting memories.', text: 'Take a moment to think, then share a story. A sentence is enough.' },
  { name: 'Vote', minutes: 8, eyebrow: '03 / Notice the good', title: 'You see the magic.\nGive it a name.', text: 'Many ways to appreciate each other. Eight people to celebrate.' },
  { name: 'Celebrate', minutes: 10, eyebrow: '04 / A very Hygge honours list', title: 'Every person.\nTheir own kind of brilliant.', text: 'One award each. A little applause. And a story about why it fits.' },
  { name: 'Look ahead', minutes: 4, eyebrow: '05 / Here’s to what’s next', title: 'More good things.\nTogether.', text: 'Three years of Hygge. And so much still to make, learn, and celebrate.' }
];

// Dynamic programming chooses a globally optimal matching, not sequential winners.
// Fixed shuffled orders break equal-score ties consistently throughout a session.
export function solveMatching(weights, personOrder, categoryOrder) {
  const n = weights.length;
  let dp = Array(1 << n).fill(null);
  dp[0] = { score: 0, pairs: [] };
  for (const category of categoryOrder) {
    const next = dp.slice();
    for (let mask = 0; mask < dp.length; mask++) {
      if (!dp[mask]) continue;
      for (const person of personOrder) {
        if (mask & (1 << person)) continue;
        const target = mask | (1 << person);
        const score = dp[mask].score + weights[person][category];
        if (!next[target] || score > next[target].score) {
          next[target] = { score, pairs: [...dp[mask].pairs, { person, category }] };
        }
      }
    }
    dp = next;
  }
  const result = dp.at(-1);
  if (!result) throw new Error('There must be at least as many categories as recipients.');
  return result;
}

export function allocate(ballots, personOrder, categoryOrder) {
  const weights = MEMBERS.map(() => CATEGORIES.map(() => 0));
  for (const ballot of Object.values(ballots)) {
    ballot.forEach((person, category) => weights[person][category]++);
  }
  return solveMatching(weights, personOrder, categoryOrder).pairs;
}
