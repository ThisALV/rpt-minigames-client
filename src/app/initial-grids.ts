import { MinigameType, SquareState } from './minigame-enums';


/// Shortcut for `SquareState.WHITE` value inside grid
export const WHITE: SquareState = SquareState.WHITE;
/// Shortcut for `SquareState.BLACK` value inside grid
export const BLACK: SquareState = SquareState.BLACK;
/// Shortcut for `SquareState.FREE` value inside grid
export const EMPTY: SquareState = SquareState.FREE;


/**
 * Contains initial board game grid for each RpT Minigame available.
 */
export const initialGrids = {
  [MinigameType.ACORES]: [
    [ WHITE, WHITE, WHITE, BLACK, BLACK ],
    [ WHITE, WHITE, WHITE, BLACK, BLACK ],
    [ WHITE, WHITE, EMPTY, BLACK, BLACK ],
    [ WHITE, WHITE, BLACK, BLACK, BLACK ],
    [ WHITE, WHITE, BLACK, BLACK, BLACK ],
  ],
  [MinigameType.BERMUDES]: [
    [ BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK ],
    [ BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK ],
    [ BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK, BLACK ],
    [ EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY ],
    [ EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY ],
    [ EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY ],
    [ WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE ],
    [ WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE ],
    [ WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE ],
  ],
  [MinigameType.CANARIES]: [
    [ BLACK, BLACK, BLACK, BLACK ],
    [ BLACK, BLACK, BLACK, BLACK ],
    [ WHITE, WHITE, WHITE, WHITE ],
    [ WHITE, WHITE, WHITE, WHITE ]
  ]
};

/**
 * Contains initial pawn counts inside grid for each RpT Minigame available.
 */
export const initialPawnCounts = {
  [MinigameType.ACORES]: { white: 12, black: 12 },
  [MinigameType.BERMUDES]: { white: 27, black: 27 },
  [MinigameType.CANARIES]: { white: 8, black: 8 }
};
