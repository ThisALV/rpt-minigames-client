import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { LobbyComponent } from './lobby.component';
import { expectArrayToBeEqual, MockedMessagingSubject } from '../testing-helpers';
import { RptlProtocolService } from 'rpt-webapp-client';
import { FormsModule } from '@angular/forms';
import { Player } from '../player';


describe('LobbyComponent', () => {
  let component: LobbyComponent;
  let fixture: ComponentFixture<LobbyComponent>;

  let connection: MockedMessagingSubject; // Mocked connection to emulates server behavior

  beforeEach(async () => {
    connection = new MockedMessagingSubject(); // Uses a new mocked connection for each test

    await TestBed.configureTestingModule({
      imports: [ FormsModule ],
      declarations: [ LobbyComponent ]
    }).compileComponents();

    const rptlProtocol = TestBed.inject(RptlProtocolService);

    // Must be registered before component initialization stage
    rptlProtocol.beginSession(connection);
    rptlProtocol.register(42, 'ThisALV');
    connection.receive('REGISTRATION 42 ThisALV'); // Emulates a server into which we're the only player connected

    fixture = TestBed.createComponent(LobbyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component', () => expect(component).toBeTruthy());

  it('should listen for players state updates', () => {
    // At beginning, we're the only player and we're not ready yet
    expectArrayToBeEqual(component.players, new Player(42, false));

    connection.receive('LOGGED_IN 22 Cobalt'); // A new player joined the Lobby
    // Cobalt just joined, he's inside Lobby but not ready neither
    expectArrayToBeEqual(component.players, new Player(42, false), new Player(22, false));

    connection.receive('SERVICE EVENT Lobby READY_PLAYER 42'); // ThisALV is now ready
    expectArrayToBeEqual(component.players, new Player(42, true), new Player(22, false));

    connection.receive('SERVICE EVENT Lobby READY_PLAYER 42'); // Redox is now ready
    expectArrayToBeEqual(component.players, new Player(42, true), new Player(22, true));

    connection.receive('SERVICE EVENT Lobby WAITING_FOR_PLAYER 42'); // ThisALV is no longer ready
    expectArrayToBeEqual(component.players, new Player(42, true), new Player(22, false));

    connection.receive('LOGGED_OUT 22'); // Redox just left Lobby room
    expectArrayToBeEqual(component.players, new Player(42, false)); // We're the only player remaining
  });

  it('should listen for countdown updates', fakeAsync(() => {
    expect(component.startingCountdown).toBeUndefined(); // No countdown at initialization

    connection.receive('SERVICE EVENT Lobby BEGIN_COUNTDOWN 5000'); // Receives a countdown of 5s before game starts
    expect(component.startingCountdown).toEqual(5000);

    // After 1s has passed, countdown should updates to a new value
    tick(1000);
    expect(component.startingCountdown).toEqual(4000);
    // Checks again until 0 is reach
    tick(1000);
    expect(component.startingCountdown).toEqual(3000);
    tick(1000);
    expect(component.startingCountdown).toEqual(2000);
    tick(1000);
    expect(component.startingCountdown).toEqual(1000);
    tick(1000);
    expect(component.startingCountdown).toEqual(1000); // Reaches 0, countdown terminated so it is no longer updates
    connection.receive('SERVICE EVENT Lobby END_COUNTDOWN'); // When countdown is done, server notifies us and countdown is removed
    expect(component.startingCountdown).toBeUndefined();

    connection.receive('SERVICE EVENT Lobby BEGIN_COUNTDOWN 3000'); // Receives a new countdown of 3s before game starts
    expect(component.startingCountdown).toEqual(3000);

    // After 1s has passed, countdown should updates to a new value
    tick(1000);
    expect(component.startingCountdown).toEqual(2000);
    // But this time, we cancel it before it actually terminates
    connection.receive('SERVICE EVENT Lobby END_COUNTDOWN');
    expect(component.startingCountdown).toBeUndefined(); // Checks if it has terminated the countdown as expected
  }));

  it('should listen for lobby state updates', () => {
    expect(component.isPlaying).toBeFalse(); // Lobby open at initialization

    connection.receive('SERVICE EVENT Lobby PLAYING'); // Server notifies a game has started from this Lobby
    expect(component.isPlaying).toBeTrue();

    connection.receive('SERVICE EVENT Lobby WAITING'); // Servers notifies that game has terminate
    expect(component.isPlaying).toBeFalse();
  });
});
