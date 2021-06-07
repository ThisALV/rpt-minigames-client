import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { GameServer } from '../game-server';
import { ServersListService } from '../servers-list.service';
import { RuntimeErrorsService } from '../runtime-errors.service';
import { SHARED_CONNECTION_FACTORY } from '../game-server-connection';
import { servers } from '../servers.json';
import { GameServerResolutionService } from '../game-server-resolution.service';
import { RptlProtocolService } from 'rpt-webapp-client';


// Used by ServersList component to provides a real RPTL configured WebSocket connection handling error with given RuntimeErrors service
function rptlConnectionFactory(currentServerUrl: string, errorsHandler: RuntimeErrorsService): Subject<string> {
  return SHARED_CONNECTION_FACTORY.rptlConnectionFor(currentServerUrl, errorsHandler);
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

  /**
   * Name of game server inside `serversStatus` which is currently selected, if any.
   */
  selectedServerName?: string;

  private readonly serverPorts: { [serverName: string]: number }; // Registry of port for each known game server

  private serversStatusSubscription?: Subscription; // When uninitialized, no longer wait for requested game servers status

  constructor(
    private readonly serversStatusProvider: ServersListService,
    private readonly urlsProvider: GameServerResolutionService,
    private readonly mainAppProtocol: RptlProtocolService,
    private readonly mainAppErrorsHandler: RuntimeErrorsService)
  {
    this.serversStatus = []; // No server to show while no update has been done

    // Initializes registry for every known port accessible from its name, make easier to check for a selected server URL later
    this.serverPorts = {};
    for (const gameServer of servers) {
      this.serverPorts[gameServer.name] = gameServer.port; // Associates server port with its name
    }
  }

  /**
   * Request to update game servers status.
   */
  checkout(): void {
    this.serversStatusProvider.update(rptlConnectionFactory); // Updates using WebSocket connection
  }

  /**
   * Connects RPTL protocol WebSocket to given game server.
   *
   * @param serverName Name for server to connect with
   */
  select(serverName: string): void {
    // Retrieves URL from provider using port from initialized game servers DB
    const serverUrl = this.urlsProvider.resolve(this.serverPorts[serverName]);

    // Connects to server using resolved URL from selected name
    this.mainAppProtocol.beginSession(SHARED_CONNECTION_FACTORY.rptlConnectionFor(serverUrl, this.mainAppErrorsHandler));
    // App component will see we connected to RPTL on unregistered mode and will register us as expected
  }

  /**
   * Initializes then update array with checkout() method response from ServersList service.
   */
  ngOnInit(): void {
    // Saves subscription to stop it when component is destroyed
    this.serversStatusSubscription = this.serversStatusProvider.getListStatus().subscribe({
      next: (updatedServersStatus: GameServer[]) => this.serversStatus = updatedServersStatus
    });

    // Updates a first time to retrieve at servers list at least one time
    this.checkout();
  }

  /**
   * Stops to listen for servers status updates.
   */
  ngOnDestroy(): void {
    this.serversStatusSubscription?.unsubscribe();
  }
}
