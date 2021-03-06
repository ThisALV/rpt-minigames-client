import { Injectable } from '@angular/core';
import { Actor, RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';


/**
 * Provides a list of actors UID with a subject which is never stopped, with no need to manually call `updateActorsSubscribable()` call
 * if observed before registration, as UIDs will be automatically emitted at when registered mode is enabled.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class ActorsListService {
  private readonly actors: Subject<number[]>;

  /**
   * Initializes subject with currently connected actors, listening for next actors list updates.
   *
   * @param rptlProtocol Actors list updates provider
   */
  constructor(private readonly rptlProtocol: RptlProtocolService) {
    this.actors = new Subject<number[]>();

    // As soon as a new actors list subject is provided by RPTL protocol <=> as soon as client is registered as an actor to see other actors
    rptlProtocol.getState().pipe(filter((newState: RptlState) => newState === RptlState.REGISTERED)).subscribe({
      next: () => this.listenActorsList()
    });

    // Actors list subject might already be provided if 1st injection occurs when registered
    if (rptlProtocol.isSessionRunning() && rptlProtocol.isRegistered()) {
      this.listenActorsList();
    }
  }

  /// Listens for actors list modifications inside RPTL protocol service and publishes them into this instance subbject
  private listenActorsList(): void {
    // Listen for next actors update, will automatically stop when unregistered, or disconnection
    this.rptlProtocol.getActors().subscribe({
      // Converts actors list into an UIDs list, and pushes new value into subject
      next: (updatedList: Actor[]) => this.actors.next(updatedList.map((a: Actor) => a.uid))
    });

    // Right after registration, actors list hasn't been passed into subject, must be updated manually
    this.rptlProtocol.updateActorsSubscribable();
  }

  /**
   * @returns An observable of UIDs list which is never stopped
   */
  getList(): Observable<number[]> {
    return this.actors;
  }

  /**
   * Pushes the current actors UID list inside `getList()` subject.
   */
  updateList(): void {
    this.rptlProtocol.updateActorsSubscribable();
  }
}
