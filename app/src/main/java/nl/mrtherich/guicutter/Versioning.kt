package nl.mrtherich.guicutter

/** Release tags are vMAJOR.MINOR.PATCH. Reject other formats, never guess. */
object Versioning {
    private val pattern = Regex("^v?(\\d+)\\.(\\d+)\\.(\\d+)$")

    fun compare(remote: String, installed: String): Int {
        val a = parse(remote)
        val b = parse(installed)
        for (index in 0..2) {
            if (a[index] != b[index]) return a[index].compareTo(b[index])
        }
        return 0
    }

    private fun parse(value: String): List<Int> {
        val match = pattern.matchEntire(value) ?: throw IllegalArgumentException("Unexpected release version: $value")
        return match.groupValues.drop(1).map { it.toInt() }
    }
}
