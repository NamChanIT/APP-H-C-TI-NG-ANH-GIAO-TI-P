const material = {
  'Open practice': {
    goal: 'Keep a conversation going by sharing a detail and asking a follow-up.',
    vocabulary: ['bring up — introduce a topic', 'relate to — understand through a similar experience', 'perspective — a way of seeing something'],
    collocations: ['strike up a conversation', 'find common ground', 'see eye to eye'],
    scenario: 'Two people meet at a language exchange and find a shared interest.',
    debate: 'A good conversation benefits from a planned topic.',
    key: 'Build on your partner’s last point before introducing a new idea.'
  },
  'Everyday Conversations': {
    goal: 'Describe a personal experience and explain how your habits or preferences have changed.',
    vocabulary: ['routine — a regular pattern', 'preference — a choice you favour', 'trade-off — a balance between competing benefits'],
    collocations: ['break a habit', 'make time for something', 'get into the swing of things'],
    scenario: 'Two friends with different habits compare what works for them and agree on something to try together.',
    debate: 'People should experiment with changing their routines more often.',
    key: 'Include concrete details and use time markers to show change.'
  },
  'Work and Professional Communication': {
    goal: 'Explain your position professionally and propose an outcome that addresses another person’s priorities.',
    vocabulary: ['constraint — a limit on what is possible', 'feasible — possible to carry out', 'compromise — an agreement involving concessions'],
    collocations: ['raise a concern', 'reach a consensus', 'get the ball rolling'],
    scenario: 'Two colleagues disagree on priorities for an upcoming project and need a practical agreement.',
    debate: 'A quick decision is usually better than waiting for agreement across the whole team.',
    key: 'Acknowledge the competing priority and propose a specific next step.'
  },
  'Social Situations': {
    goal: 'Recognise another point of view, clarify meaning and make a tactful suggestion.',
    vocabulary: ['assumption — something accepted without proof', 'tactful — careful to avoid offending someone', 'mutual — shared by both sides'],
    collocations: ['clear up a misunderstanding', 'offer reassurance', 'break the ice'],
    scenario: 'Two friends discover they have different expectations and try to clarify them without causing offence.',
    debate: 'Directness matters more than politeness when friends disagree.',
    key: 'Use a clarification question and acknowledge the other person’s perspective.'
  },
  'Travel and Real-world Scenarios': {
    goal: 'State a practical problem clearly, check details and negotiate an alternative.',
    vocabulary: ['alternative — another available choice', 'disruption — an interruption to plans', 'requirement — something necessary'],
    collocations: ['make arrangements', 'confirm availability', 'go the extra mile'],
    scenario: 'A traveller asks a local representative for help when their original plan becomes unavailable.',
    debate: 'Making flexible travel plans is worth paying more for.',
    key: 'Confirm the agreed action and its timing in your own words.'
  },
  'Advanced B2 Discussions': {
    goal: 'Defend a qualified opinion with evidence and respond to a counterargument.',
    vocabulary: ['implication — a possible consequence', 'plausible — reasonably believable', 'long-term — continuing over an extended period'],
    collocations: ['weigh the benefits', 'address a concern', 'look at the bigger picture'],
    scenario: 'Two panel guests recommend different responses to an issue and explain who each response would affect.',
    debate: 'Long-term benefits should take priority over short-term inconvenience.',
    key: 'Connect your example to your claim and qualify any broad conclusions.'
  }
};

export function lessonFor(topic) {
  const base = material[topic.group];
  const title = topic.id === 'free' ? 'the topic you just chose' : topic.title.toLowerCase();
  return {
    ...base,
    questions: [
      `What comes to mind first when you think about ${title}?`,
      `What personal experience has shaped your view of ${title}?`,
      `How has your attitude toward ${title} changed over time?`,
      `What is often misunderstood about ${title}, and why?`,
      `Which aspect of ${title} would you most like to understand better?`,
      `What advice about ${title} would you give someone with very little experience?`,
      `How might someone with a different background approach ${title}?`,
      `What practical problem connected to ${title} could you solve this week?`,
      `If you had to explain the most important trade-off in ${title}, what would you say?`,
      `What could change your mind about an issue connected to ${title}?`
    ],
    followUps: ['Can you give a specific example?', 'What would change if the other person disagreed?'],
    frames: ['From my perspective, …', 'I see why you say that, although …', 'It depends on whether …'],
    criteria: [base.key, 'Explain at least one reason and respond directly to a follow-up.']
  };
}
