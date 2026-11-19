// EnFact's artwork, or none in the Contractor build (edition/art.ts)
declare module "virtual:edition-art" {
  const art: import("./edition/art").EditionArt;
  export default art;
}
