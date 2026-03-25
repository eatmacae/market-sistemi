/**
 * expo-sqlite için Jest manual mock
 * storage.test.ts bu dosyayı jest.mock('expo-sqlite') ile kullanır
 */

const mockDb = {
  execAsync    : jest.fn().mockResolvedValue(undefined),
  runAsync     : jest.fn().mockResolvedValue(undefined),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync   : jest.fn().mockResolvedValue([]),
};

export const openDatabaseSync = jest.fn(() => mockDb);

// Testlerin mockDb metodlarına erişmesi için
export const _mockDb = mockDb;
