(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-AMOUNT u101)
(define-constant ERR-INVALID-MILESTONE u102)
(define-constant ERR-INVALID-STATUS u103)
(define-constant ERR-ESCROW-NOT-FOUND u104)
(define-constant ERR-ALREADY-FUNDED u105)
(define-constant ERR-NOT-FUNDED u106)
(define-constant ERR-MILESTONE-NOT-DUE u107)
(define-constant ERR-INVALID-COMMISSION u108)
(define-constant ERR-DISPUTE-ACTIVE u109)
(define-constant ERR-NO-DISPUTE u110)
(define-constant ERR-INVALID-TOKEN u111)
(define-constant ERR-TRANSFER-FAILED u112)

(define-data-var escrow-counter uint u1)
(define-data-var platform-fee uint u100)
(define-data-var authority-contract (optional principal) none)

(define-map escrows
  { escrow-id: uint }
  {
    client: principal,
    artist: principal,
    amount: uint,
    token-type: (string-ascii 10),
    milestones: (list 10 { amount: uint, status: (string-ascii 20), due-block: uint }),
    status: (string-ascii 20),
    commission-id: uint,
    dispute-active: bool
  }
)

(define-map escrow-balances
  { escrow-id: uint }
  { balance: uint }
)

(define-read-only (get-escrow (escrow-id uint))
  (map-get? escrows { escrow-id: escrow-id })
)

(define-read-only (get-escrow-balance (escrow-id uint))
  (default-to { balance: u0 } (map-get? escrow-balances { escrow-id: escrow-id }))
)

(define-read-only (get-platform-fee)
  (var-get platform-fee)
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-milestone (milestone { amount: uint, status: (string-ascii 20), due-block: uint }))
  (if (and (> (get amount milestone) u0) (>= (get due-block milestone) block-height))
      (ok true)
      (err ERR-INVALID-MILESTONE))
)

(define-private (validate-status (status (string-ascii 20)))
  (if (or (is-eq status "pending") (is-eq status "funded") (is-eq status "completed") (is-eq status "disputed"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-token-type (token (string-ascii 10)))
  (if (or (is-eq token "STX") (is-eq token "SIP10"))
      (ok true)
      (err ERR-INVALID-TOKEN))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-platform-fee (new-fee uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID-AMOUNT))
    (var-set platform-fee new-fee)
    (ok true)
  )
)

(define-public (create-escrow
  (client principal)
  (artist principal)
  (amount uint)
  (token-type (string-ascii 10))
  (milestones (list 10 { amount: uint, status: (string-ascii 20), due-block: uint }))
  (commission-id uint)
)
  (let
    (
      (escrow-id (var-get escrow-counter))
      (total-milestone-amount (fold + (map get-amount milestones) u0))
    )
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq client artist)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-amount amount))
    (try! (validate-token-type token-type))
    (asserts! (is-eq amount total-milestone-amount) (err ERR-INVALID-AMOUNT))
    (map validate-milestone milestones)
    (map-set escrows
      { escrow-id: escrow-id }
      {
        client: client,
        artist: artist,
        amount: amount,
        token-type: token-type,
        milestones: milestones,
        status: "pending",
        commission-id: commission-id,
        dispute-active: false
      }
    )
    (map-set escrow-balances { escrow-id: escrow-id } { balance: u0 })
    (var-set escrow-counter (+ escrow-id u1))
    (print { event: "escrow-created", id: escrow-id })
    (ok escrow-id)
  )
)

(define-public (fund-escrow (escrow-id uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) (err ERR-ESCROW-NOT-FOUND)))
      (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))
    )
    (asserts! (is-eq (get client escrow) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status escrow) "pending") (err ERR-ALREADY-FUNDED))
    (asserts! (not (get dispute-active escrow)) (err ERR-DISPUTE-ACTIVE))
    (try! (validate-amount (get amount escrow)))
    (if (is-eq (get token-type escrow) "STX")
        (try! (stx-transfer? (+ (get amount escrow) (var-get platform-fee)) tx-sender authority))
        (try! (contract-call? .sip10-token transfer (+ (get amount escrow) (var-get platform-fee)) tx-sender authority none))
    )
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow { status: "funded" })
    )
    (map-set escrow-balances
      { escrow-id: escrow-id }
      { balance: (get amount escrow) }
    )
    (print { event: "escrow-funded", id: escrow-id })
    (ok true)
  )
)

(define-public (release-milestone (escrow-id uint) (milestone-index uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) (err ERR-ESCROW-NOT-FOUND)))
      (milestones (get milestones escrow))
      (milestone (unwrap! (element-at milestones milestone-index) (err ERR-INVALID-MILESTONE)))
      (current-balance (get balance (get-escrow-balance escrow-id)))
      (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))
    )
    (asserts! (is-eq (get client escrow) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status escrow) "funded") (err ERR-NOT-FUNDED))
    (asserts! (>= block-height (get due-block milestone)) (err ERR-MILESTONE-NOT-DUE))
    (asserts! (not (get dispute-active escrow)) (err ERR-DISPUTE-ACTIVE))
    (asserts! (is-eq (get status milestone) "pending") (err ERR-INVALID-STATUS))
    (try! (validate-amount (get amount milestone)))
    (if (is-eq (get token-type escrow) "STX")
        (try! (as-contract (stx-transfer? (get amount milestone) tx-sender (get artist escrow))))
        (try! (as-contract (contract-call? .sip10-token transfer (get amount milestone) tx-sender (get artist escrow) none)))
    )
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow
        {
          milestones: (replace-at milestones milestone-index
            (merge milestone { status: "completed" }))
        }
      )
    )
    (map-set escrow-balances
      { escrow-id: escrow-id }
      { balance: (- current-balance (get amount milestone)) }
    )
    (print { event: "milestone-released", id: escrow-id, milestone: milestone-index })
    (ok true)
  )
)

(define-public (initiate-dispute (escrow-id uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) (err ERR-ESCROW-NOT-FOUND)))
    )
    (asserts! (or (is-eq (get client escrow) tx-sender) (is-eq (get artist escrow) tx-sender)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status escrow) "funded") (err ERR-NOT-FUNDED))
    (asserts! (not (get dispute-active escrow)) (err ERR-DISPUTE-ACTIVE))
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow { dispute-active: true })
    )
    (print { event: "dispute-initiated", id: escrow-id })
    (ok true)
  )
)

(define-public (resolve-dispute (escrow-id uint) (refund-to-client bool))
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) (err ERR-ESCROW-NOT-FOUND)))
      (current-balance (get balance (get-escrow-balance escrow-id)))
      (authority (unwrap! (var-get authority-contract) (err ERR-NOT-AUTHORIZED)))
    )
    (asserts! (is-eq authority tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (get dispute-active escrow) (err ERR-NO-DISPUTE))
    (asserts! (> current-balance u0) (err ERR-NOT-FUNDED))
    (if refund-to-client
        (if (is-eq (get token-type escrow) "STX")
            (try! (as-contract (stx-transfer? current-balance tx-sender (get client escrow))))
            (try! (as-contract (contract-call? .sip10-token transfer current-balance tx-sender (get client escrow) none)))
        )
        (if (is-eq (get token-type escrow) "STX")
            (try! (as-contract (stx-transfer? current-balance tx-sender (get artist escrow))))
            (try! (as-contract (contract-call? .sip10-token transfer current-balance tx-sender (get artist escrow) none)))
        )
    )
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow { status: "completed", dispute-active: false })
    )
    (map-set escrow-balances
      { escrow-id: escrow-id }
      { balance: u0 }
    )
    (print { event: "dispute-resolved", id: escrow-id, refund: refund-to-client })
    (ok true)
  )
)