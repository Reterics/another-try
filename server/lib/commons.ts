export function isInMargin(playerPos: number, bulletPos: number) {
    let marginSize = 5
    let bottomMargin = bulletPos - (marginSize / 2)
    let topMargin = bulletPos + (marginSize / 2)

    return (playerPos > bottomMargin) && (playerPos < topMargin);
}
