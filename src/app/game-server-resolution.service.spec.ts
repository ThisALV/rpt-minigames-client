import { TestBed } from '@angular/core/testing';
import { GameServerResolutionService } from './game-server-resolution.service';


describe('GameServerResolutionService', () => {
  const hostname = 'rpt-minigames.com'; // Hostname doesn't really matter, so it can have a default value

  let service: GameServerResolutionService;
  let protocol: string;

  // Must be called manually because location analyzing is done during service construction so protocol property must be initialized before
  function beforeEach(): void {
    TestBed.configureTestingModule({
      providers: [
        { // Mocks window object with a custom hostname and protocol input values for service constructor
          provide: Window, useValue: {
            location: { protocol, hostname }
          }
        }
      ]
    });

    service = TestBed.inject(GameServerResolutionService);
  }

  it('should throw if protocol is neither https: nor http:', () => {
    protocol = 'file:'; // Case where file is read from local disk: no server to connect for games
    expect(() => beforeEach()).toThrowError(URIError); // Fails at construction
  });

  it('should creates ws: address if protocol is http:', () => {
    protocol = 'http:'; // No SSL/TLS certificate available for this server
    beforeEach();

    expect(service.resolve(50505)).toEqual('ws://rpt-minigames.com:50505/');
  });

  it('should creates wss: address if protocol is https:', () => {
    protocol = 'https:'; // SSL/TLS certificate available for this server, cannot mix protocols
    beforeEach();

    expect(service.resolve(32707)).toEqual('wss://rpt-minigames.com:32707/');
  });
});
