const paths = {
  wave: 'M2 12h3l2-6 3 12 3-15 3 17 2-8h4',
  studio: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  history: 'M3 12a9 9 0 1 0 3-7M3 4v5h5M12 7v5l4 2',
  mic: 'M9 13V5a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0zM5 11v2a7 7 0 0 0 14 0v-2M12 20v3m-4 0h8',
  camera: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  cc: 'M3 5h18v14H3zM10 10H7v4h3m7-4h-3v4h3',
  pause: 'M9 5v14m6-14v14',
  play: 'M8 5l11 7-11 7z',
  phone: 'M3 15v-4c4-4 14-4 18 0v4h-5v-3a10 10 0 0 0-8 0v3z',
  chat: 'M4 5h16v12H9l-5 4zM8 9h8m-8 4h5',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12',
  book: 'M12 6c-3-2-6-2-10-1v13c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1v13',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2',
  lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4m-4 4v3',
  spark: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z'
};

export function Icon({ name, size = 20 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
