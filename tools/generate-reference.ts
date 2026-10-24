if (process.argv.includes('--geometry-experiment')) {
  await import('./experiment-reference-geometry');
} else if (process.argv.includes('--control-experiment')) {
  await import('./experiment-reference-controls');
} else {
  await import('./adopt-reference-candidate');
}
