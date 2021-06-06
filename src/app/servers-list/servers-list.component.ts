import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { GameServer } from '../game-server';
import { ServersListService } from '../servers-list.service';
import { RuntimeErrorsService } from '../runtime-errors.service';
import { rptlConnectionFor } from '../game-server-connection';


// Used by ServersList component to provides a real RPTL configured WebSocket connection handling error with given RuntimeErrors service
function rptlConnectionFactory(currentServerUrl: string, errorsHandler: RuntimeErrorsService): Subject<string> {
  return rptlConnectionFor(currentServerUrl, errorsHandler);
}


/**
 * At initialization and when asked by application user, uses `ServersListService` to checkout for each known RpT Minigame server.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Component({
  selector: 'app-servers-list',
  templateUrl: './servers-list.component.html',
  styleUrls: ['./servers-list.component.css']
})
export class ServersListComponent implements OnInit, OnDestroy {
  /**
   * Latest updated servers status list.
   */
  serversStatus: GameServer[];

  private serversStatusSubscription?: Subscription; // When uninitialized, no longer wait for requested game servers status

  constructor(private readonly serversStatusProvider: ServersListService) {
    this.serversStatus = []; // No server to show while no update has been done
  }

  /**
   * Request to update game servers status.
   */
  checkout(): void {
    this.serversStatusProvider.update(rptlConnectionFactory); // Updates using WebSocket connection
  }

  /**
   * Updates array with checkout() method response from ServersList service.
   */
  ngOnInit(): void {
    // Saves subscription to stop it when component is destroyed
    this.serversStatusSubscription = this.serversStatusProvider.getListStatus().subscribe({
      next: (updatedServersStatus: GameServer[]) => this.serversStatus = updatedServersStatus
    });
  }

  /**
   * Stops to listen for servers status updates.
   */
  ngOnDestroy(): void {
    this.serversStatusSubscription?.unsubscribe();
  }
}
