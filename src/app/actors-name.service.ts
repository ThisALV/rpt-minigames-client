import { Injectable } from '@angular/core';
import { Actor, BadRptlMode, RptlProtocolService, RptlState } from 'rpt-webapp-client';


/**
 * Thrown by `ActorsNameService.nameFor()` when given actor UID isn't registered into server.
 */
export class UnknownActor extends Error {
  /**
   * @param uid UID which a name was expected for
   */
  constructor(uid: number) {
    super(`No actor with UID ${uid}`);
  }
}


type NamesRegistry = { [actorUid: number]: string };


/**
 * Constantly observes current `RptlState` to observe actors with `RptlProtocolService.getActors()` as soon RPTL enters registeres mode.
 * That will make UID -> Name actors associations available at any moment if this client is an registered actor inside server (so it can
 * see other actors).
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class ActorsNameService {
  private actorsNameRegistry?: NamesRegistry; // Initialized when available <=> when RptlState is REGISTERED

  /**
   * Listen to RPTL protocol, observing actors list when it is registered.
   *
   * @param rptlProtocol Protocol to read actors list from
   */
  constructor(private readonly rptlProtocol: RptlProtocolService) {
    const context: ActorsNameService = this;

    rptlProtocol.getState().subscribe({ // Update internal state to be consistent with RPTL protocol state and actors accessibility
      next(newState: RptlState): void {
        if (newState === RptlState.REGISTERED) { // Actors db is now accessible
          context.makeAvailable();
        } else { // Actors db is no longer accessible
          context.makeUnavailable();
        }
      }
    });
  }

  // Called when put into state REGISTERED, we can now access actors db but it must be updated at least one first for subject to have a
  // value
  private makeAvailable(): void {
    this.actorsNameRegistry = {};

    const context: ActorsNameService = this;
    this.rptlProtocol.getActors().subscribe({
      next(updatedActorsList: Actor[]): void {
        context.actorsNameRegistry = {}; // Resets list to initialize DB actor by actor

        for (const actor of updatedActorsList) { // Actor by actor, associate UID with appropriate name
          context.actorsNameRegistry[actor.uid] = actor.name;
        }
      }
    });

    this.rptlProtocol.updateActorsSubscribable();
  }

  // Called when put into state other than REGISTERED, we can no longer access actors db
  private makeUnavailable(): void {
    this.actorsNameRegistry = undefined;
  }

  /**
   * @returns `true` if we're into registered mode so `nameFor()` can be called, `false` otherwise
   */
  isAvailable(): boolean {
    return this.actorsNameRegistry !== undefined;
  }

  /**
   * @param actorUid Actor to retrieve name for
   *
   * @returns Name associated with given actor
   */
  nameFor(actorUid: number): string {
    if (!this.isAvailable()) { // Checks for actors registry to be available
      throw new BadRptlMode(true);
    }

    // Tries to retrieve name for given UID, now we're sure that actorsNameRegistry is available
    const name: string | undefined = (this.actorsNameRegistry as NamesRegistry)[actorUid];

    if (name === undefined) { // Checks for given UID to be registered inside DB
      throw new UnknownActor(actorUid);
    }

    // It it is the case, returns its name
    return name;
  }


}
