import { Component, OnDestroy, OnInit } from '@angular/core';
import { LoginService } from './login.service';
import { Subscription } from 'rxjs';
import { RptlProtocolService, RptlState } from 'rpt-webapp-client';


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

  private stateSub?: Subscription; // Subscription for RPTL getState() observer

  constructor(
    private readonly rptlProtocol: RptlProtocolService,
    private readonly loginData: LoginService
  ) {
    this.insideRoom = false;
  }

  /**
   * Listens for current RPTL state and registers client when it connects to a game server *for other reason than checkout*, then
   * displays lobby room when registration is done.
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
            break;
          case RptlState.DISCONNECTED: // No longer inside server, dismisses lobby room
            this.insideRoom = false;
            break;
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe(); // Stops listening for RPTL state as application will be destroyed
  }
}
