"""Room fan levels from the creator's cumulative Lidya threshold table."""

THRESHOLDS = (0, 1, 16, 66, 196, 496, 1096, 2246, 4296, 7746, 13246,
              21646, 33946, 51446, 75746, 108946, 153646, 213146,
              291546, 393846, 526146, 695946, 912346, 1186146, 1530146,
              1959346, 2491446, 3146946, 3949346, 4925846, 6107546,
              7530446, 9236046, 11272046, 13693446, 16563746,
              19956246, 23956246, 28663746, 34196246, 50000000)


def level_for_total(total: int) -> int:
    return max(i for i, threshold in enumerate(THRESHOLDS) if int(total or 0) >= threshold)
