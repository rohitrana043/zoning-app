package com.realestate.zoningupdate;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import java.util.Collections;

@SpringBootApplication
@EnableTransactionManagement
@EnableAspectJAutoProxy
@EnableCaching
public class ZoningApplication {
	public static void main(String[] args) {
		SpringApplication app = new SpringApplication(ZoningApplication.class);

		// Set default profile if not specified
		String profilesActive = System.getenv("SPRING_PROFILES_ACTIVE");
		if (profilesActive == null || profilesActive.isEmpty()) {
			app.setDefaultProperties(Collections.singletonMap("spring.profiles.active", "dev"));
		}

		app.run(args);
	}
}