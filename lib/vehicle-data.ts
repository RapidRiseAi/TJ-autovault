import makesModels from '@/data/vehicle-makes-models.json';

type MakeMap = Record<string, string[]>;

const map = makesModels as MakeMap;
const makeList = Object.keys(map);

export function getVehicleMakes() {
  return makeList;
}

export function getModelsForMake(make: string) {
  if (!make) return ['Other'];
  return map[make] ?? ['Other'];
}
