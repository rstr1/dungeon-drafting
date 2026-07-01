import type { Algorithm } from "./types";
import { drunkardWalk } from "./drunkardWalk";

//---------------------------------------//
//  Algorithm Registry                   //
//---------------------------------------//
// Keeps track of all available algorithms
// To add a new algorithm:
//      1. implement it
//      2. import it
//      3. add to array

export const ALGORITHMS: Algorithm[] = [
    drunkardWalk,
]