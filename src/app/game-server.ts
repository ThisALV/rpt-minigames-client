import { Availability } from 'rpt-webapp-client';


/**
 * Provides every server data a standard user should know about.
 */
export class GameServer {
  /**
   * Extended full name for RpT Minigame type if recognized, constructor parameter name otherwise
   */
  readonly gameName: string;

  /**
   * @param name Server name
   * @param gameType RpT Minigame, if a, b or c, will be extended respectively to Açores, Bermudes or Canaries
   * @param status Server status retrieved by STATUS RPTL command if any, otherwise it means RPTL connection failed
   */
  constructor(public readonly name: string, gameType: string, public readonly status?: Availability) {
    switch (gameType) {
      case 'a':
        this.gameName = 'Açores';
        break;
      case 'b':
        this.gameName = 'Bermudes';
        break;
      case 'c':
        this.gameName = 'Canaries';
        break;
      default:
        this.gameName = gameType;
    }
  }
}


/**
 * Converts a JSON array received from the Hub into a TypeScript exploitable `GameServer[]`.
 *
 * @param json JSON-formatted `GameServer` array
 *
 * @returns `GameServer[]` with, when available, updated status, usable with `ServersListService`
 */
export function serversFromJsonString(json: string): GameServer[] {
  const result: GameServer[] = []; // We start with an empty servers list
  const parsedServersArray = JSON.parse(json);

  for (const server of parsedServersArray) {
    let availability: Availability | undefined;
    // If availability property was received, then we assign it to the argument object
    if (server.availability !== undefined) {
      // Reading properties from the JSON object
      availability = new Availability(server.availability.currentActors, server.availability.actorsLimit);
    }

    // Constructs server object with data parsed from the JSON array, and adds it to the servers list
    result.push(new GameServer(server.name, server.game, availability));
  }

  return result;
}
