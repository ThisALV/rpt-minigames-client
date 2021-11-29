import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { GameServer } from '../game-server';
import { ServersListService } from '../servers-list.service';
import { RuntimeErrorsService } from '../runtime-errors.service';
import { SHARED_CONNECTION_FACTORY } from '../game-server-connection';
import { servers } from '../servers.json';
import { GameServerResolutionService } from '../game-server-resolution.service';
import { RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { first } from 'rxjs/operators';
import { MinigameService } from '../minigame.service';
import { MinigameType } from '../minigame-enums';
import { SHARED_HUB_CONNECTION_FACTORY } from '../hub-connection';


// Port to connect on remote server
const HUB_SERVER_PORT = 35554;


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
   * Provides Number() function, used without new to convert every number into a primitive value.
   */
  toPrimitive = Number;

  /**
   * Latest updated servers status list.
   */
  serversStatus: GameServer[];

  /**
   * Name of game server inside `serversStatus` which is currently selected, if any.
   */
  selectedServerName?: string;

  private readonly serverPorts: { [serverName: string]: number }; // Registry of port for each known game server
  private readonly serverMinigameTypes: { [serverName: string]: string }; // Registry of RpT Minigame type for each known game server

  private hubConnection?: Subject<GameServer[]>;
  private serversStatusSubscription?: Subscription; // When uninitialized, no longer wait for requested game servers status
  private sessionEndSubscription?: Subscription; // When uninitialized, doesn't wait for previously selected session to end

  constructor(
    private readonly serversStatusProvider: ServersListService,
    private readonly urlsProvider: GameServerResolutionService,
    private readonly mainAppProtocol: RptlProtocolService,
    private readonly mainAppErrorsHandler: RuntimeErrorsService,
    private readonly minigameService: MinigameService
  ) {
    this.serversStatus = []; // No server to show while no update has been done

    // Initializes registry for every known port accessible from its name, make easier to check for a selected server URL later
    // Same thing for every known minigame type
    this.serverPorts = {};
    this.serverMinigameTypes = {};
    for (const gameServer of servers) {
      this.serverPorts[gameServer.name] = gameServer.port; // Associates server port with its name
      this.serverMinigameTypes[gameServer.name] = gameServer.game; // Associates server run minigame type with its name
    }
  }

  /// Begin a session with WS connection on given URL, applies selected class to appropriate HTML element and configures
  // `MinigameService` to play on that RpT Minigame type
  private connectWith(serverUrl: string, serverName: string): void {
    // Connects to server using resolved URL from selected name
    this.mainAppProtocol.beginSession(SHARED_CONNECTION_FACTORY.rptlConnectionFor(serverUrl, this.mainAppErrorsHandler));
    this.selectedServerName = serverName;
    // App component will see we connected to RPTL on unregistered mode and will register us as expected

    const selectedMinigameType = this.serverMinigameTypes[serverName]; // Minigame type name obtained by server name
    let parsedMinigameType: MinigameType;
    switch (selectedMinigameType) { // Checks for each available RpT Minigame type
      case 'a':
        parsedMinigameType = MinigameType.ACORES;
        break;
      case 'b':
        parsedMinigameType = MinigameType.BERMUDES;
        break;
      case 'c':
        parsedMinigameType = MinigameType.CANARIES;
        break;
      default:
        throw new Error(`Unknown minigame: ${selectedMinigameType}`); // Should not happen
    }

    this.minigameService.playOn(parsedMinigameType); // Configures Minigame service to run on selected minigame server game type
  }

  /// Establishes a connection with the game servers hub and listen for servers list updates
  private connectWithHub(): void {
    // Connects to hub
    this.hubConnection = SHARED_HUB_CONNECTION_FACTORY.hubConnectionFor(
      this.urlsProvider.resolve(HUB_SERVER_PORT), this.mainAppErrorsHandler
    );
    // Listen updates from the hub
    this.serversStatusProvider.listen(this.hubConnection);
  }

  /**
   * Requests to update game servers status right now, creating connection if it was closed earlier.
   */
  checkout(): void {
    if (!this.serversStatusProvider.isListening()) {
      // Manual update request will be done by the service as we start a new listen operation
      this.connectWithHub();
    } else { // Otherwise, ask for it to be sent from here
      this.serversStatusProvider.requestUpdate();
    }
  }

  /**
   * Connects RPTL protocol WebSocket to given game server, disconnecting from previous game server if required.
   *
   * @param serverName Name for server to connect with
   */
  select(serverName: string): void {
    // Retrieves URL from provider using port from initialized game servers DB
    const serverUrl = this.urlsProvider.resolve(this.serverPorts[serverName]);

    // If URL has been successfully resolved, we disconnect from current server if we're currently connected
    if (this.mainAppProtocol.isSessionRunning()) {
      // We must wait to be logged out before beginning a new session
      this.sessionEndSubscription = this.mainAppProtocol.getState().pipe(
        first((s: RptlState) => s === RptlState.DISCONNECTED) // Session ends when connection is stopped
      ).subscribe({
        next: () => this.connectWith(serverUrl, serverName)
      });

      this.mainAppProtocol.endSession();
    } else { // No current session, begins a new session immediately
      this.connectWith(serverUrl, serverName);
    }
  }

  /**
   * Establishes connection with hub, wait for servers list to be updated and send checkout request to get servers list for the 1st time.
   */
  ngOnInit(): void {
    // Saves subscription to stop it when component is destroyed
    this.serversStatusSubscription = this.serversStatusProvider.getListStatus().subscribe({
      next: (updatedServersStatus: GameServer[]) => this.serversStatus = updatedServersStatus
    });

    this.connectWithHub();
  }

  /**
   * Stops to listen for servers status updates and disconnect from hub.
   */
  ngOnDestroy(): void {
    this.serversStatusSubscription?.unsubscribe();
    this.sessionEndSubscription?.unsubscribe();

    // Closes WSS connection with hub normally
    this.hubConnection?.complete();
  }
}
