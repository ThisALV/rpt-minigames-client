import { MinigameType, SquareState } from './minigame.service';

/*
 * Shortcuts for `SquareState` enum values inside grid.
 */

const WHITE: SquareState = SquareState.WHITE;
const BLACK: SquareState = SquareState.BLACK;
const EMPTY: SquareState = SquareState.FREE;


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
