import { Component, OnDestroy, OnInit } from '@angular/core';
import { LoginService } from './login.service';
import { Subscription } from 'rxjs';
import { RptlProtocolService, RptlState } from 'rpt-webapp-client';
import { filter } from 'rxjs/operators';
import { ServersListService } from './servers-list.service';


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
  private stateSub?: Subscription; // Subscription for RPTL getState() observer

  constructor(
    private readonly rptlProtocol: RptlProtocolService,
    private readonly loginData: LoginService,
    private readonly checkoutProcess: ServersListService
  ) {}

  /**
   * Listens for current RPTL state and registers client when it connects to a game server *for other reason than checkout*.
   */
  ngOnInit(): void {
    this.stateSub = this.rptlProtocol.getState().pipe(filter((s: RptlState) => s === RptlState.UNREGISTERED)).subscribe({
      next: () => {
        if (!this.checkoutProcess.isUpdating()) { // Doesn't try to register if we're just checking out the server
          this.rptlProtocol.register(this.loginData.generateUid(), this.loginData.name); // Uses logins data to register
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe(); // Stops listening for RPTL state as application will be destroyed
  }
}
