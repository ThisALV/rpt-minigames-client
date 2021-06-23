import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { ServersListComponent } from './servers-list/servers-list.component';
import { LoginComponent } from './login/login.component';
import { ChatComponent } from './chat/chat.component';
import { RuntimeErrorsComponent } from './runtime-errors/runtime-errors.component';
import { expectArrayToBeEqual, MockedMessagingSubject, MockedServersListProvider } from './testing-helpers';
import { RptlProtocolService } from 'rpt-webapp-client';
import { LoginService } from './login.service';
import { FormsModule } from '@angular/forms';
import { ServersListService } from './servers-list.service';
import { SHARED_CONNECTION_FACTORY } from './game-server-connection';
import { LobbyComponent } from './lobby/lobby.component';
import { MinigameComponent } from './minigame/minigame.component';


describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;

  let connection: MockedMessagingSubject; // Required to mocks server registration command which will change RPTL mode into registered
  let rptlProtocol: RptlProtocolService; // Used to make connection and registration into game server
  let serversStatusList: MockedServersListProvider; // Used to check if a checkout operation has been started at registration

  beforeEach(async () => {
    connection = new MockedMessagingSubject();
    serversStatusList = new MockedServersListProvider(); // We need to have the mocked type to access the updating field

    // Mocks connection provider to give a random mocked connection subject for every connection established by the ServersList
    // component, which doesn't matter here because we're not going to use that way to connect with a server but we're going to use the
    // RptlProtocol service directly
    spyOn(SHARED_CONNECTION_FACTORY, 'rptlConnectionFor').and.callFake(() => new MockedMessagingSubject());

    await TestBed.configureTestingModule({
      imports: [ RouterTestingModule, FormsModule ],
      declarations: [
        AppComponent, ChatComponent, LobbyComponent, LoginComponent, MinigameComponent, RuntimeErrorsComponent, ServersListComponent
      ],
      providers: [
        {
          // Mocks a web application running on https://localhost/, because GameServerResolutionService requires it to formats URLs
          provide: Window, useValue: {
            location: { protocol: 'https:', hostname: 'localhost' }
          }
        },
        {
          // Mocks a predetermined list of servers status retrieved and displayed by ServersList service/component
          provide: ServersListService, useValue: serversStatusList
        },
        {
          // Mocks a login which is always UID 42 with name ThisALV
          provide: LoginService, useValue: {
            name: 'ThisALV', generateUid: (): number => 42
          }
        }
      ]
    }).compileComponents();

    rptlProtocol = TestBed.inject(RptlProtocolService);

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component', () => expect(component).toBeTruthy());

  it('should create and listen for connection to begin registration, then display room when registered', () => {
    expect(component.insideRoom).toBeFalse(); // Should begin as not connected inside any server

    rptlProtocol.beginSession(connection); // Connects to server using mocked connection
    expectArrayToBeEqual(connection.sentMessagesQueue, 'LOGIN 42 ThisALV'); // As it connected, it should have automatically send LOGIN
    expect(component.insideRoom).toBeFalse(); // Connected and sent handshake command, but we've not received confirmation from server yet

    connection.receive('REGISTRATION 42 ThisALV'); // Concludes registration without any other player, which doesn't matter for this test
    expect(component.insideRoom).toBeTrue(); // Now we're finally registered

    connection.complete(); // Close connection with mocked server
    expect(component.insideRoom).toBeFalse(); // We were disconnected, no longer inside Lobby room because connection was closed
  });

  it('should hide lobby component when game starts, and display it again when game stops', () => {
    expect(component.insideGame).toBeFalse(); // Should begin as not playing as we're not connected yet

    rptlProtocol.beginSession(connection); // Connects to a server, will automatically try to register
    connection.receive('REGISTRATION 42 ThisALV 22 Redox'); // Registration done, with another player so we can start the game

    expect(component.insideGame).toBeFalse(); // Should still be false as we're not playing yet
    connection.receive('SERVICE EVENT Minigame START 42 22'); // Starts a game session with our 2 registered players
    expect(component.insideGame).toBeTrue(); // Running a game session
    connection.receive('SERVICE EVENT Minigame STOP'); // Stops game session
    expect(component.insideGame).toBeFalse();
  });

  it('should display lobby again even if game terminated unexpectedly', () => {
    rptlProtocol.beginSession(connection);
    connection.receive('REGISTRATION 42 ThisALV 22 Redox');

    connection.receive('SERVICE EVENT Minigame START 42 22'); // Starts a game session with our 2 registered players
    expect(component.insideGame).toBeTrue(); // Running a game session
    connection.complete(); // Stops session abnormally by leaving room because of a closed connection
    expect(component.insideGame).toBeFalse(); // Should have been set back to false anyways
  });

  it('should start a servers checkout when registered if not already updating', () => {
    let updatedServers = false; // Required to listen if a new value has been received
    serversStatusList.getListStatus().subscribe({
      next: () => updatedServers = true
    });

    rptlProtocol.beginSession(connection);
    expect(updatedServers).toBeFalse(); // Should not occurs at connection but at registration
    connection.receive('REGISTRATION 42 ThisALV 22 Redox');
    expect(updatedServers).toBeTrue(); // Unable to use isUpdating() as mocked ServersList service updates immediately
  });

  it('should not start a servers checkout when registered if already updating', () => {
    let updatedServers = false; // Required to listen if a new value has been received
    serversStatusList.getListStatus().subscribe({
      next: () => updatedServers = true
    });

    rptlProtocol.beginSession(connection);
    serversStatusList.updating = true; // Between connection and registration, user decides to update the status list
    expect(updatedServers).toBeFalse(); // Should not occurs at connection but at registration
    connection.receive('REGISTRATION 42 ThisALV 22 Redox');
    expect(updatedServers).toBeFalse(); // Should not have tried to start a second servers list update at the same time
  });
});
