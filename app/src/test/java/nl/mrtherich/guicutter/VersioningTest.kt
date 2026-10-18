package nl.mrtherich.guicutter

import org.junit.Assert.assertEquals
import org.junit.Test

class VersioningTest {
    @Test fun newerVersion() = assertEquals(1, Versioning.compare("v0.0.2", "0.0.1"))
    @Test fun sameVersion() = assertEquals(0, Versioning.compare("v1.2.3", "1.2.3"))
    @Test fun olderVersion() = assertEquals(-1, Versioning.compare("v1.2.3", "1.3.0"))
    @Test(expected = IllegalArgumentException::class)
    fun invalidVersion() { Versioning.compare("latest", "0.0.1") }
}
