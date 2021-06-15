import { Component, OnDestroy, OnInit } from '@angular/core';
import { LobbyService } from '../lobby.service';
import { Player } from '../player';
import { of, Subscription } from 'rxjs';
import { delay } from 'rxjs/operators';
import { RptlProtocolService } from 'rpt-webapp-client';
import { ActorsNameService } from '../actors-name.service';
import { ActorsListService } from '../actors-list.service';


// Duration in milliseconds between each countdown display updating
const COUNTDOWN_STEP_DURATION_MS = 1000;


/**
 * Displays room players list with their, that is if they're ready or not, countdown before game if it is starting and provides a button
 * to be ready/waiting.
 *
 * @author ThisALV, https://github.com/ThisALV/
 */
@Component({
  selector: 'app-lobby',
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.css']
})
export class LobbyComponent implements OnInit, OnDestroy {
  /**
   * Players for actors currently registered inside Lobby.
   */
  players: Player[];

  /**
   * Milliseconds to wait until `isPlaying` become `true` if no player state modification occurs before, `undefined` is game isn't about
   * to start soon.
   */
  startingCountdown?: number;

  /**
   * `true` if a game is currently running so Lobby is busy, `false` if Lobby is open because no game is running.
   */
  isPlaying: boolean;

  private playersSubscription?: Subscription;
  private isStartingSubscription?: Subscription;
  private isPlayingSubscription?: Subscription;

  constructor(
    private readonly lobby: LobbyService,
    private readonly selfIdentityProvider: RptlProtocolService,
    private readonly actorsListProvider: ActorsListService,
    public readonly namesProvider: ActorsNameService
  ) {
    this.players = [];
    this.isPlaying = false;
  }

  /// Updates and displays countdown every a certain step until duration is 0 or less
  private startCountdown(remainingDurationMs: number): void {
    this.startingCountdown = remainingDurationMs; // Displays remaining time before game actually starts

    // Waits for 1 second
    of(undefined).pipe(delay(COUNTDOWN_STEP_DURATION_MS)).subscribe({
      next: () => {
        // 1 s has passed since the last recursive iteration
        const newRemainingDuration = remainingDurationMs - COUNTDOWN_STEP_DURATION_MS;

        if (newRemainingDuration >= 0) { // if there is still time to wait, recursively does next iteration for the next 1 s
          this.startCountdown(newRemainingDuration);
        } // Else, stopCountdown() will be called by isStarting() observer
      }
    });
  }

  /// Dismisses starting countdown
  private stopCountdown(): void {
    this.startingCountdown = undefined;
  }

  /**
   * Calls `toggleReady()` on the underlying `LobbyService`.
   */
  toggleReady(): void {
    this.lobby.toggleReady();
  }

  /**
   * @returns `true` if the client actor is marked as ready inside `playersList`, `false` otherwise
   */
  isOurselvesReady(): boolean {
    // UID for actor owned by this browser client
    const ourUid = this.selfIdentityProvider.getSelf().uid;
    // Player assigned with our actor, aka player which is owned by our actor UID
    const ourPlayer = this.players.find((p: Player) => p.actorUid === ourUid) as Player; // We're sure to find a Player with that UID

    return ourPlayer.isReady;
  }

  /**
   * Forces update and listens for players state, and resets Lobby state then listens for it.
   */
  ngOnInit(): void {
    this.startingCountdown = undefined; // Resets countdown state as we're entering a new Lobby room
    this.isPlaying = false; // When initialized it means that client just entered a Lobby room so it is initialized as open

    // Listens for players state updates
    this.playersSubscription = this.lobby.getPlayers().subscribe({
      next: (updatedPlayers: Player[]) => this.players = updatedPlayers
    });

    // Listens for a new starting countdown to be running for a given duration
    this.isStartingSubscription = this.lobby.isStarting().subscribe({
      next: (countdownRunning: boolean) => {
        if (countdownRunning) { // If a starting countdown begun, displays it
          this.startCountdown(this.lobby.getCurrentCountdown()); // Retrieves duration and starts component own countdown
        } else { // If countdown was stopped
          this.stopCountdown();
        }
      }
    });

    // Listens for Lobby to be open or busy depending on if a game is currently running or not
    this.isPlayingSubscription = this.lobby.isPlaying().subscribe({
      next: (newState: boolean) => this.isPlaying = newState
    });


    // We're sure about startingCountdown and isPlaying value at new lifecycle, but we need to know about players currently connected
    // which are unknown. To update players list, a new value for actors list must be emitted.
    this.actorsListProvider.updateList();
  }

  /**
   * Stops to listen for any state change.
   */
  ngOnDestroy(): void {
    this.playersSubscription?.unsubscribe();
    this.isStartingSubscription?.unsubscribe();
    this.isPlayingSubscription?.unsubscribe();
  }
}
