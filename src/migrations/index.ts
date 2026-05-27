import * as migration_20260527_110701 from './20260527_110701';

export const migrations = [
  {
    up: migration_20260527_110701.up,
    down: migration_20260527_110701.down,
    name: '20260527_110701'
  },
];
