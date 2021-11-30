import { GameServer} from './game-server';
import { expectArrayToBeEqual } from './testing-helpers';
import { Availability } from 'rpt-webapp-client';
import { HubWebsocketConfig } from './hub-connection';
import { TestBed } from '@angular/core/testing';
import { RuntimeErrorsService } from './runtime-errors.service';


describe('HubWebsocketConfig', () => {
  // Config object which defines serialize/deserialize operations
  let config: HubWebsocketConfig;

  // For each test, initializes the config object using the hub URL and the project global error handler from the injectables system
  beforeEach(() => config = new HubWebsocketConfig('wss://localhost:35554/', TestBed.inject(RuntimeErrorsService)));

  describe('serializer', () => {
    it('should serializes every list into REQUEST message, but log a warn when it is not empty', () => {
      const warnLogging = spyOn(console, 'warn'); // Spies calls for console.warn() to check if non empty list trigger it

      expect(config.serializer([])).toEqual('REQUEST');
      expect(warnLogging.calls.count()).toEqual(0); // Empty list, no warning

      expect(config.serializer([
        new GameServer('Açores', 'a')
      ])).toEqual('REQUEST');
      expect(warnLogging.calls.count()).toEqual(1); // Non empty list, one more warning

      expect(config.serializer([
        new GameServer('Açores', 'a'),
        new GameServer('Bermudes', 'b', new Availability(1, 2))
      ])).toEqual('REQUEST');
      expect(warnLogging.calls.count()).toEqual(2); // Non empty list, one more warning
    });
  });

  describe('deserializer', () => {
    it('should convert JSON game servers array into a GameServer List', () => {
      // This is the JSON we are received from the hub
      // Servers 2 and 6 have their status retrieved
      const serversArray = `
      [
        {
          "name": "Açores #1",
          "game": "a",
          "port": 35555
        },
        {
          "name": "Açores #2",
          "game": "a",
          "port": 35556,
          "availability": {
            "currentActors": 1,
            "actorsLimit": 2
          }
        },
        {
          "name": "Bermudes #1",
          "game": "b",
          "port": 35557
        },
        {
          "name": "Bermudes #2",
          "game": "b",
          "port": 35558
        },
        {
          "name": "Canaries #1",
          "game": "c",
          "port": 35559
        },
        {
          "name": "Canaries #2",
          "game": "c",
          "port": 35560,
          "availability": {
            "currentActors": 0,
            "actorsLimit": 2
          }
        }
     ]
    `;

      const result = config.deserializer({data: serversArray} as MessageEvent); // We're sure only data field will be used by deserializer

      // We're expecting the result to contain all these servers in this precise order
      expectArrayToBeEqual(
        result,
        new GameServer('Açores #1', 'a'),
        new GameServer('Açores #2', 'a', new Availability(1, 2)),
        new GameServer('Bermudes #1', 'b'),
        new GameServer('Bermudes #2', 'b'),
        new GameServer('Canaries #1', 'c'),
        new GameServer('Canaries #2', 'c', new Availability(0, 2)),
      );
    });

    it('should ignore ill-formed availability JSON properties', () => {
      // This is the JSON we are received from the hub
      // Servers 1 and 4 have ill-formed status
      const serversArray = `
      [
        {
          "name": "Açores #1",
          "game": "a",
          "port": 35555,
          "availability": {
            "currentActors": "something",
            "actorsLimit": 2
          }
        },
        {
          "name": "Açores #2",
          "game": "a",
          "port": 35556
        },
        {
          "name": "Bermudes #1",
          "game": "b",
          "port": 35557,
          "availability": {
            "currentActors": 0,
            "actorsLimit": 2
          }
        },
        {
          "name": "Bermudes #2",
          "game": "b",
          "port": 35558,
          "availability": null
        },
        {
          "name": "Canaries #1",
          "game": "c",
          "port": 35559
        },
        {
          "name": "Canaries #2",
          "game": "c",
          "port": 35560
        }
     ]
    `;

      const result = config.deserializer({data: serversArray} as MessageEvent); // We're sure only data field will be used by deserializer

      // We're expecting the result to contain all these servers in this precise order, with status ignored for servers 1 and 4
      expectArrayToBeEqual(
        result,
        new GameServer('Açores #1', 'a'),
        new GameServer('Açores #2', 'a'),
        new GameServer('Bermudes #1', 'b', new Availability(0, 2)),
        new GameServer('Bermudes #2', 'b'),
        new GameServer('Canaries #1', 'c'),
        new GameServer('Canaries #2', 'c'),
      );
    });
  });
});
