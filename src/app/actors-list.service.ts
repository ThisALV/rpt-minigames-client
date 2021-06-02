import { Injectable } from '@angular/core';
import { Actor, RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';


/**
 * Provides a list of actors UID with a subject which is never stopped, with no need to manually call `updateActorsSubscribable()` call.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Injectable({
  providedIn: 'root'
})
export class ActorsListService {
  private actors: Subject<number[]>;

  /**
   * Initializes subject with currently connected actors, listening for next actors list updates.
   *
   * @param rptlProtocol Actors list updates provider
   */
  constructor(rptlProtocol: RptlProtocolService) {
    this.actors = new Subject<number[]>();

    const context: ActorsListService = this;
    // As soon as a new actors list subject is provided by RPTL protocol <=> as soon as client is registered as an actor to see other actors
    rptlProtocol.getState().pipe(filter((newState: RptlState) => newState === RptlState.REGISTERED)).subscribe({
      next(): void {
        // Listen for next actors update, will automatically stop when unregistered, or disconnection
        rptlProtocol.getActors().subscribe({
          // Converts actors list into an UIDs list, and pushes new value into subject
          next: (updatedList: Actor[]) => context.actors.next(updatedList.map((a: Actor) => a.uid))
        });

        // Right after registration, actors list hasn't been passed into subject, must be updated manually
        rptlProtocol.updateActorsSubscribable();
      }
    });
  }

  /**
   * @returns An observable of UIDs list which is never stopped
   */
  getList(): Observable<number[]> {
    return this.actors;
  }
}
