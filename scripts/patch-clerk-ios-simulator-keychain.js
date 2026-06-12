const fs = require('fs');
const path = require('path');

const sourcePath = path.join(
  __dirname,
  '..',
  'ios',
  'build',
  'SourcePackages',
  'checkouts',
  'clerk-ios',
  'Sources',
  'ClerkKit',
  'Storage',
  'Keychain',
  'SystemKeychain.swift'
);

if (!fs.existsSync(sourcePath)) {
  console.log('[mobile] clerk-ios SPM checkout not found, skipping simulator keychain patch');
  process.exit(0);
}

const original = fs.readFileSync(sourcePath, 'utf8');

if (original.includes('SimulatorFallbackKeychainStore')) {
  console.log('[mobile] clerk-ios simulator keychain patch already applied');
  process.exit(0);
}

let next = original;

next = next.replace(
  'import Security\n\n/// A concrete keychain storage backed by the system Keychain services.',
  `import Security

#if targetEnvironment(simulator)
private final class SimulatorFallbackKeychainStore: @unchecked Sendable {
  private let lock = NSLock()
  private var items: [String: Data] = [:]

  func set(_ data: Data, forKey key: String) {
    lock.lock()
    defer { lock.unlock() }
    items[key] = data
  }

  func data(forKey key: String) -> Data? {
    lock.lock()
    defer { lock.unlock() }
    return items[key]
  }

  func deleteItem(forKey key: String) {
    lock.lock()
    defer { lock.unlock() }
    items.removeValue(forKey: key)
  }

  func hasItem(forKey key: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return items[key] != nil
  }
}
#endif

/// A concrete keychain storage backed by the system Keychain services.`
);

next = next.replace(
  '  private let service: String\n  private let accessGroup: String?\n  private let accessibility: Accessibility\n',
  `  private let service: String
  private let accessGroup: String?
  private let accessibility: Accessibility

#if targetEnvironment(simulator)
  private static let simulatorFallbackStore = SimulatorFallbackKeychainStore()
#endif
`
);

next = next.replace(
  `      let updateStatus = SecItemUpdate(updateQuery as CFDictionary, attributes as CFDictionary)
      guard updateStatus == errSecSuccess else {
        throw KeychainError.unexpectedStatus(updateStatus)
      }
    default:
      throw KeychainError.unexpectedStatus(status)
    }
  }
`,
  `      let updateStatus = SecItemUpdate(updateQuery as CFDictionary, attributes as CFDictionary)
      guard updateStatus == errSecSuccess else {
#if targetEnvironment(simulator)
        if updateStatus == errSecMissingEntitlement {
          Self.simulatorFallbackStore.set(data, forKey: fallbackKey(for: key))
          return
        }
#endif
        throw KeychainError.unexpectedStatus(updateStatus)
      }
    default:
#if targetEnvironment(simulator)
      if status == errSecMissingEntitlement {
        Self.simulatorFallbackStore.set(data, forKey: fallbackKey(for: key))
        return
      }
#endif
      throw KeychainError.unexpectedStatus(status)
    }
  }
`
);

next = next.replace(
  `    switch status {
    case errSecSuccess:
      return result as? Data
    case errSecItemNotFound:
      return nil
    default:
      throw KeychainError.unexpectedStatus(status)
    }
  }
`,
  `    switch status {
    case errSecSuccess:
      return result as? Data
    case errSecItemNotFound:
      return nil
    default:
#if targetEnvironment(simulator)
      if status == errSecMissingEntitlement {
        return Self.simulatorFallbackStore.data(forKey: fallbackKey(for: key))
      }
#endif
      throw KeychainError.unexpectedStatus(status)
    }
  }
`
);

next = next.replace(
  `    switch status {
    case errSecSuccess, errSecItemNotFound:
      return
    default:
      throw KeychainError.unexpectedStatus(status)
    }
  }
`,
  `    switch status {
    case errSecSuccess, errSecItemNotFound:
#if targetEnvironment(simulator)
      Self.simulatorFallbackStore.deleteItem(forKey: fallbackKey(for: key))
#endif
      return
    default:
#if targetEnvironment(simulator)
      if status == errSecMissingEntitlement {
        Self.simulatorFallbackStore.deleteItem(forKey: fallbackKey(for: key))
        return
      }
#endif
      throw KeychainError.unexpectedStatus(status)
    }
  }
`
);

next = next.replace(
  `    switch status {
    case errSecSuccess:
      return true
    case errSecItemNotFound:
      return false
    default:
      throw KeychainError.unexpectedStatus(status)
    }
  }
`,
  `    switch status {
    case errSecSuccess:
      return true
    case errSecItemNotFound:
      return false
    default:
#if targetEnvironment(simulator)
      if status == errSecMissingEntitlement {
        return Self.simulatorFallbackStore.hasItem(forKey: fallbackKey(for: key))
      }
#endif
      throw KeychainError.unexpectedStatus(status)
    }
  }
`
);

next = next.replace(
  `  private func baseQuery(for key: String) -> [String: Any] {
    var query: [String: Any] = [
`,
  `  private func baseQuery(for key: String) -> [String: Any] {
    var query: [String: Any] = [
`
);

next = next.replace(
  `    return query
  }
}
`,
  `    return query
  }

#if targetEnvironment(simulator)
  private func fallbackKey(for key: String) -> String {
    "\\(service)::\\(key)"
  }
#endif
}
`
);

if (next === original) {
  console.log('[mobile] clerk-ios simulator keychain patch did not match source');
  process.exit(1);
}

try {
  fs.chmodSync(sourcePath, 0o644);
} catch {
  // Package-managed checkouts can be read-only. If chmod fails, the write below
  // will surface the underlying filesystem error with the exact path.
}

fs.writeFileSync(sourcePath, next);
console.log('[mobile] patched clerk-ios simulator keychain fallback');
