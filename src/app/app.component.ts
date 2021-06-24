import { Component, OnDestroy, OnInit } from '@angular/core';
import { LoginService } from './login.service';
import { interval, Subscription } from 'rxjs';
import { RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { MinigameService } from './minigame.service';
import { ServersListService } from './servers-list.service';
import { rptlConnectionFactory } from './game-server-connection';
import { delay } from 'rxjs/operators';


/**
 * Handles global application state management, such as registration when client connects with a server using the logins data.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  /**
   * `true` if client is registered within server and is now inside a Lobby room, `false` if not connected or unregistered.
   */
  insideRoom: boolean;

  /**
   * `true` if registered client is playing a game session so lobby must be hidden.
   */
  insideGame: boolean;

  private stateSub?: Subscription; // Subscription for RPTL getState() observer
  private isRunningSub?: Subscription; // Subscription for MinigameService isRunning() observer
  private statusUpdateSub?: Subscription; // Subscription for interval() observer which automatically refresh servers state

  constructor(
    private readonly rptlProtocol: RptlProtocolService,
    private readonly gameStateProvider: MinigameService,
    private readonly loginData: LoginService,
    private readonly serversStatusList: ServersListService
  ) {
    this.insideRoom = false;
    this.insideGame = false;
  }

  /**
   * Listens for current RPTL state and registers client when it connects to a game server *for other reason than checkout*, then
   * displays server room when registration is done. If game is running, lobby is hidden. When registered, performs a servers status
   * list update.
   */
  ngOnInit(): void {
    this.stateSub = this.rptlProtocol.getState().subscribe({
      next: (state: RptlState) => {
        switch (state) {
          case RptlState.UNREGISTERED: // When connected, begins registration
            // CHECKOUT connection will not be caught as their running on CheckoutRptlProtocolService
            this.rptlProtocol.register(this.loginData.generateUid(), this.loginData.name); // Uses logins data to register

            break;
          case RptlState.REGISTERED: // Registered inside server, can show room with other actors
            this.insideRoom = true;

            // As client has joined and registered, a server status has been changed and must be updated again
            if (!this.serversStatusList.isUpdating()) { // Might already be updating list
              this.serversStatusList.update(rptlConnectionFactory, delay(500));
            }

            break;
          case RptlState.DISCONNECTED: // No longer inside server, dismisses lobby room
            this.insideRoom = false;
            break;
        }
      }
    });

    // When game session has started, hides lobby and displays game board
    this.isRunningSub = this.gameStateProvider.isRunning().subscribe({
      next: (playing: boolean) => this.insideGame = playing
    });

    // Every 5s, automatically updates servers status list if is not already updating
    this.statusUpdateSub = interval(5000).subscribe({
      next: () => {
        if (!this.serversStatusList.isUpdating()) { // Might be already updating if just registered or manually triggered by user
          this.serversStatusList.update(rptlConnectionFactory);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe(); // Stops listening for RPTL state as application will be destroyed
    this.isRunningSub?.unsubscribe(); // Same thing for game session state
    this.statusUpdateSub?.unsubscribe();
  }
}
