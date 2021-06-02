/**
 * Represents data for every player inside Lobby.
 */
export class Player {
  constructor(public actorUid: number, public name: string, public isReady: boolean) {}
}
