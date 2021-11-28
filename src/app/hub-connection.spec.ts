import { GameServer, serversFromJsonString } from './game-server';
import { expectArrayToBeEqual } from './testing-helpers';
import { Availability } from 'rpt-webapp-client';


describe('serversFromJsonString', () => {
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

    const result = serversFromJsonString(serversArray);

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
});
