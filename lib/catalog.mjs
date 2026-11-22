export const characters = [
  { id: 'emma', name: 'Emma', locale: 'en-GB', style: 'Friendly and cheerful', skin: '#ca805e', hair: '#4b2929', shirt: '#bded55', background: '#383952' },
  { id: 'alex', name: 'Alex', locale: 'en-US', style: 'Witty and energetic', skin: '#a66243', hair: '#272137', shirt: '#ffad78', background: '#414057' },
  { id: 'sophia', name: 'Sophia', locale: 'en-US', style: 'Patient and gentle', skin: '#e8ac87', hair: '#282332', shirt: '#c7aafa', background: '#44394d' },
  { id: 'james', name: 'James', locale: 'en-GB', style: 'Professional and direct', skin: '#dca889', hair: '#563d32', shirt: '#91beff', background: '#2f4058' },
  { id: 'olivia', name: 'Olivia', locale: 'en-AU', style: 'Curious and easygoing', skin: '#b67551', hair: '#42252e', shirt: '#fdaebd', background: '#49394a' }
];

const groups = [
  ['Everyday Conversations', 'Daily routine and lifestyle|Friends and relationships|Shopping and consumer habits|Food and restaurants|Hobbies and entertainment|Health and fitness|Travel experiences|Cultural differences|Personal goals|Social media and technology'],
  ['Work and Professional Communication', 'Job interviews|Office conversations|Team meetings|Project management|Presenting ideas|Negotiating deadlines|Handling disagreements|Customer communication|Problem-solving at work|Giving and receiving feedback'],
  ['Social Situations', 'Meeting new friends|Going to a party|Making small talk|Asking for advice|Expressing opinions|Discussing controversial topics respectfully|Making plans with friends|Resolving misunderstandings|Telling personal stories|Giving recommendations'],
  ['Travel and Real-world Scenarios', 'Airport conversations|Hotel check-in|Ordering food|Asking for directions|Booking transportation|Dealing with lost luggage|Visiting a doctor|Shopping abroad|Making travel arrangements|Handling unexpected situations'],
  ['Advanced B2 Discussions', 'Artificial intelligence|Climate change|Education systems|Remote working|Work-life balance|Social media influence|Technology and privacy|Personal finance|Cultural traditions|Future career opportunities']
];
export const topics = [
  { id: 'free', title: 'Free conversation', group: 'Open practice' },
  ...groups.flatMap(([group, titles]) => titles.split('|').map(title => ({
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, group
  })))
];
export const modes = {
  free: 'Free Talk',
  role: 'Role Play',
  debate: 'Debate',
  simulation: 'Real-life Simulation',
  challenge: 'B2 Speaking Challenge'
};
