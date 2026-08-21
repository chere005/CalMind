import { describe, expect, it } from 'vitest';
import { checkFetchUrl, hostOf, isPublicHost, parseIpv4, parseIpv6 } from '../src/fetchguard';

const refused = (u: string) => {
  const r = checkFetchUrl(u);
  return r.ok ? `ALLOWED ${r.host}` : 'refused';
};

describe('checkFetchUrl — the shape of a pasted link', () => {
  it('takes an ordinary recipe link', () => {
    const r = checkFetchUrl('https://www.seriouseats.com/basque-cheesecake');
    expect(r).toEqual({ ok: true, url: 'https://www.seriouseats.com/basque-cheesecake', host: 'www.seriouseats.com' });
  });

  it('reads a bare host as https — a share sheet hands you one', () => {
    const r = checkFetchUrl('seriouseats.com/x');
    expect(r.ok && r.url).toBe('https://seriouseats.com/x');
  });

  it('trims, and says so when there is nothing there', () => {
    expect(checkFetchUrl('   ')).toEqual({ ok: false, why: 'no link' });
    expect(checkFetchUrl('  https://a.example/x ').ok).toBe(true);
  });

  it('refuses schemes that are not the web', () => {
    for (const u of ['file:///etc/passwd', 'ftp://a.example/x', 'data:text/html,<b>', 'javascript:alert(1)']) {
      expect(refused(u), u).toBe('refused');
    }
  });

  it('keeps plain http — plenty of small recipe sites are still on it', () => {
    expect(checkFetchUrl('http://a.example/x').ok).toBe(true);
  });
});

describe('never this device, never this network', () => {
  it('refuses the names that mean here', () => {
    for (const h of ['localhost', 'mac.local', 'CALMIND.LOCAL', 'nas', 'router.lan', 'x.internal', 'a.home.arpa', 'printer.localdomain']) {
      expect(refused(`http://${h}/p`), h).toBe('refused');
    }
  });

  it('refuses the private and reserved v4 ranges', () => {
    for (const h of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '172.16.0.1', '172.31.255.254',
                     '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255']) {
      expect(refused(`http://${h}/p`), h).toBe('refused');
    }
  });

  it('lets a real public address through', () => {
    for (const h of ['8.8.8.8', '172.32.0.1', '192.169.0.1', '11.0.0.1', '223.255.255.1']) {
      expect(checkFetchUrl(`http://${h}/p`).ok, h).toBe(true);
    }
  });

  /**
   * The spellings a guard written from memory misses. Every one of these
   * reaches loopback through the ordinary resolver.
   */
  it('refuses loopback however it is spelled', () => {
    for (const h of ['0177.0.0.1', '0x7f.0.0.1', '0x7f000001', '2130706433', '127.1', '127.0.1', '127.0.0.1.']) {
      expect(refused(`http://${h}/p`), h).toBe('refused');
    }
  });

  it('refuses the v6 forms of here', () => {
    for (const h of ['[::1]', '[::]', '[fe80::1]', '[fc00::1]', '[fd12:3456::1]', '[::ffff:192.168.1.10]', '[::ffff:127.0.0.1]']) {
      expect(refused(`http://${h}/p`), h).toBe('refused');
    }
    expect(checkFetchUrl('http://[2606:4700::1111]/p').ok).toBe(true);
  });

  /**
   * 'https://www.seriouseats.com@192.168.1.10/' is a request to the LAN that
   * reads to a person as a recipe site. The host is what comes after the last
   * '@', and a password may contain one.
   */
  it('is not fooled by userinfo', () => {
    expect(refused('https://www.seriouseats.com@192.168.1.10/r')).toBe('refused');
    expect(refused('https://user:p@ss@127.0.0.1/r')).toBe('refused');
    expect(hostOf('www.seriouseats.com@192.168.1.10:8080')).toBe('192.168.1.10');
    // The message names the host it refused — see the comment on that branch.
    const r = checkFetchUrl('https://www.seriouseats.com@192.168.1.10/r');
    expect(!r.ok && r.why).toContain('192.168.1.10');
  });

  it('is not fooled by percent-encoding or case', () => {
    expect(refused('http://%31%32%37.0.0.1/p')).toBe('refused');
    expect(refused('http://LOCALHOST/p')).toBe('refused');
  });

  it('ignores the port, and the port is not the host', () => {
    expect(refused('http://192.168.1.10:8080/p')).toBe('refused');
    expect(checkFetchUrl('https://a.example:8443/p').ok).toBe(true);
  });

  it('refuses an address-shaped thing it could not parse', () => {
    for (const h of ['1.2.3.4.5', '0x', '999.1.1.1', '[::g]', '[1:2:3]']) {
      expect(refused(`http://${h}/p`), h).toBe('refused');
    }
  });
});

describe('the parsers themselves', () => {
  it('parseIpv4 takes the resolver s spellings', () => {
    expect(parseIpv4('127.0.0.1')).toBe(0x7f000001);
    expect(parseIpv4('2130706433')).toBe(0x7f000001);
    expect(parseIpv4('0177.0.0.1')).toBe(0x7f000001);
    expect(parseIpv4('127.1')).toBe(0x7f000001);
    expect(parseIpv4('256.1.1.1')).toBe(null);
    expect(parseIpv4('a.example')).toBe(null);
  });

  it('parseIpv6 expands ::', () => {
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIpv6('1:2:3:4:5:6:7:8:9')).toBe(null);
    expect(parseIpv6('a.example')).toBe(null);
  });

  it('isPublicHost is the whole decision', () => {
    expect(isPublicHost('www.seriouseats.com')).toBe(true);
    expect(isPublicHost('')).toBe(false);
  });
});
